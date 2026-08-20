# Architecture decisions

Companion to [`ROADMAP.md`](./ROADMAP.md). Where the roadmap describes the
long-term direction, this captures the concrete decisions made about *how*
Phase 1 (engine hardening) is actually built, so implementation has something
to match instead of re-deriving the shape each time.

Expect this file to grow/change as each piece is actually built and the
decisions get tested against real code.

## Component model: lightweight, not full ECS

Entities keep their identity/class (`Character`, `Item`, `Room` remain real
objects, not bare IDs), but carry a `components` bag that theme packs read
and write into for anything theme-specific:

```js
character.components.caster = { mana: 50 };
character.components.firearm = { ammo: 6 };
```

A full ECS (entities as IDs only, components as pure data, systems as
separate iterating logic) is more machinery than this project's scale
needs. Core engine code should never read or write into `components` for a
specific theme's keys — only theme pack code and the (theme-agnostic) event
handlers it registers should.

## Serialization: default assumption, not finalized

Still being worked out — noted here so it isn't lost, not because it's
settled:

- The intent is that `components` values should be plain, serializable data
  — no live socket/class-instance references. Where a component needs to
  point at another entity (an item, another character, a room), it should
  hold an ID/keyword reference and look the target up through `World`,
  rather than holding a direct object reference that has to be
  serialized/rehydrated.
- What exactly gets persisted (all of `components`? a per-component
  allowlist? does a theme pack register its own serializer?) is still open.
  Revisit this once there's an actual second or third component in play and
  real save/load pressure to design against, rather than guessing at
  hypothetical shapes now.

## Content pack layout: starting convention

A pack is a folder with:

```
some-pack/
  pack.json       # manifest: name, version, whatever metadata turns out to matter
  data/           # room/item/NPC definitions
  commands/       # verb handlers the pack registers
```

This is a starting point, expected to be refined once the first real pack is
built against it (see Phase 4 in the roadmap) — don't treat the shape above
as locked in before it's been used.

## Build order (Phase 1)

1. **Command registry** (done) — `registerCommand(name, handler)` replacing
   the static exports in `modules/commands/index.js`. Self-contained, low
   risk, proves the "theme adds verbs without touching core" story on its
   own, and previews the event-bus dispatch pattern in miniature.
2. **Event bus** (done) — `modules/events.js` (`on`/`emit`), multiple
   listeners per event. Wired so far: `command` (after dispatch, in
   `game.js`) and `enterRoom`/`leaveRoom` (room movement, in
   `modules/commands/move.js`, shared by the directional commands). `onDamage`
   and `onTick` stay unwired until combat (Phase 2) and the game clock
   (Phase 3) exist to emit them — no point guessing at their payload shape
   before the systems that produce them are real.
3. **Entity component bags** (done) — `Character`/`Item`/`Room` each carry
   `this.components = {}`. Turned out to be more invasive than "add a
   field": none of the three classes were actually instantiated anywhere in
   the running server (`World.addRoom` and the login flow built plain
   object literals instead), so the bag would've sat on dead code. Fixing
   that surfaced real bugs from the same root cause — `character.socket`
   was never assigned (so broadcasts to other players silently no-opped),
   `character.keywords` was never populated (keyword target-matching was
   dead), and room membership drifted on movement (`roomId` updated,
   `room.characters` didn't). All fixed alongside the bags, since wiring up
   real entities was the actual prerequisite for the bags to mean anything.
4. **Data-driven definitions** (done) — room/item data moved out of JS into
   `content/rooms.json`/`content/items.json`, loaded at startup by
   `modules/content/loadWorldData.js`. Named `content/`, not `data/` per
   the pack layout above — `data.js` (character persistence) already owns
   that name at the repo root. This is "core's" content for now, the same
   framing already used for `modules/commands/index.js`; it moves under a
   real pack layout once Phase 4 builds one. NPC data isn't handled here —
   there's no NPC entity/class yet (Phase 3), so there's nothing real to
   load a shape for.

Phase 1 is complete as of this step: current game behaves the same, but
commands, events, entities, and content are all now pluggable rather than
hardcoded.

Game clock/scheduler is Phase 3 in the roadmap, not part of this list —
it's needed for NPC brains, not for the engine/content split itself.

## Phase 2 decisions

**Character persistence: per-entity JSON files, not a DB (yet).** One
`characters/<name>.json` per character (`data.js`), replacing the old
single shared `characters.json`. Chosen over an embedded DB because the
project has otherwise deliberately avoided adding infrastructure before
real pressure forces it (see the serialization note above); chosen over
just expanding the single flat file because the roadmap explicitly names
that as the thing to move past. `data.js` is written as a small storage
adapter (`characterExists`/`loadCharacterState`/`saveCharacterState`) so a
future DB swap only touches this one file, not every call site.

**Character names are now a real allowlist** (`/^[A-Za-z][A-Za-z ]{1,31}$/`
in `game.js`), not just a not-blank check. Necessary once a name becomes
part of a filesystem path (`data.js`) — otherwise it's a path-traversal
vector. Filenames are the lowercased name, which also makes account lookup
case-insensitive for free (no separate duplicate-rejection logic needed;
"bob" and "Bob" resolve to the same saved record rather than colliding).

**Saves happen at session end** (`quit`, and now also an ungraceful socket
disconnect — see `modules/commands/quit.js`'s `disconnectCharacter`,
shared by both), not continuously. No autosave/checkpointing yet; revisit
if that becomes a real pain point rather than building it speculatively.

**Stats: mechanism is core, identity is theme.** The D&D sextet isn't any
more "core" than a from-scratch attribute system — both are theme-specific
identity choices on top of the same generic need (a character has named,
numeric, modifiable stats). `modules/stats.js` only knows the *shape* of a
stat (`{ base, modifiers: [{ tag, operation, amount }] }`) and how to fold
it into an effective value; it never knows what any stat is called.
`content/stats/attributes.json` (loaded by
`modules/content/loadStatDefinitions.js`) supplies the sextet + `hp` as
real proof data, in its own `content/stats/` subdirectory — not flat in
`content/` — specifically so a later `content/stats/humors.json` (the
planned fantasy-specific elemental mapping) sits next to it as an
obviously separate concern, without building any real pack-composition
machinery now (no second pack exists yet to design that against — Phase
4's job).

One exception: **`vitality` is a core-recognized role, not a hardcoded
stat name.** Combat needs to know "which stat, at its floor, means
defeated," regardless of what a theme calls it or how it's scaled (a
gritty theme's 1–3 HP and a high-fantasy theme's 100+ HP are both just
"the vitality stat" to core). A stat definition can carry a `role` tag;
core only ever looks up roles by that open string via
`getStatKeyForRole()`, never a name — adding a second recognized role
later is a data change, not an engine change. No other role is blessed
yet; inventing one without a concrete near-term consumer would repeat the
mistake this split exists to avoid.

The modifier `operation` field (`"add"`, `"multiply"` today) is
deliberately open-ended, not an exhaustive enum — this is with the
planned humoral system in mind. When it lands, an elemental "push/pull" on
an attribute should be a new `operation` case in
`stats.js`'s `getStatValue`, not a rework of how modifiers are stored or
stacked. Not built yet: any humoral mapping/shift/gating logic (no
`eat`/consume command or ability-check command exists to hook it to —
would be designing blind); time-based modifier expiry (needs the Phase 3
game clock); dice/randomness (`modules/checks/index.js`'s default
resolver is a deterministic stat-vs-threshold comparison, proving
`registerCheckResolver`/`resolveCheck`'s plumbing without inventing a
dice mechanic nobody's asked for); and migration of characters saved
before `components.stats` existed.

**Combat: sessions now, round engine and `cemote` parsing planned.** Combat
is modeled as a session, not a per-character target — target-switching
mid-fight and multiple simultaneous combatants (one character fighting
several attackers) rule out storing a single fixed opponent on the
character itself:

```js
// core, transient — not persisted across restarts, not a save-state concern
CombatSession = {
  id,
  participants: Map<character, { target, timer }>,
}

character.components.combat = { sessionId }   // pointer only, like room membership
```

`resolveAttack(attacker, defender, attackParams)` (`modules/combat/
resolveAttack.js`) is the core resolution mechanism regardless of how an
attack gets produced: runs `resolveCheck` (existing checks/stats machinery),
applies damage to the defender's `vitality`-role stat, emits `attack` (with
`hit: boolean`) and, on a hit, `damage`. It takes a fully-formed
`{ statKey, context, damage }` and never asks where that came from — the
same function will underlie both v1's auto-attack and the planned `cemote`
parser. *Which* stat keys mean "attacker's roll" and "defender's threshold"
are core-recognized **roles**, not hardcoded names — `getStatKeyForRole()`
(already generic, unchanged) is doing the same job it does for `vitality`,
just for two new role strings (`content/stats/attributes.json` tags
`strength` as `"offense"`, `dexterity` as `"defense"`). Core's own logic
(session bookkeeping) never looks these two up itself, unlike `vitality` —
only the attack producer does, via the same reusable function.

**V1 (built):** unarmed-only — no wielded-weapon concept exists yet (a
narrow slice of the still-unbuilt equipment/inventory Phase 2 item), so
`modules/combat/index.js` registers a single always-available unarmed-strike
producer (`statKey` = the `offense` role, difficulty = the defender's
`defense` role value, flat 1 damage) via `registerAttackProducer()`
(`modules/combat/registry.js`, single-slot like the checks resolver).
`kill <target>` (`modules/commands/kill.js`) starts or joins a session and
pulls the attacker out of any other fight first (one fight at a time, for
now); `disengage` removes just the caller (combat continues for whoever's
left, once m:n is really in play); `flee <north|east|south|west>`
(`modules/commands/flee.js`) is a disengage plus a move, but only commits to
either if a valid exit exists that direction — an invalid direction fails
outright, no disengage happens. A defeated participant (`vitality` role at
or below 0) is dropped from their session and fires a `defeat` event; the
session itself ends once fewer than two participants remain alive.

The **round/`pendingActions` engine** described below for the full design
isn't built yet — v1 simplifies it away because there's nothing to batch or
wait on: every action is auto-generated, so each participant just gets an
independent 2-second repeating timer (`modules/combat/session.js`) that
calls `resolveAttack` directly, instead of a shared round collecting one
action per side before resolving together. A per-session 5-minute safety
timeout still exists as a "something's stuck, force-end it" backstop, since
nothing else guarantees a session terminates. This also means v1 can't
produce the full design's "mutual knockout in the same round" outcome — each
timer resolves on its own — that lands with the real round engine, when
`cemote` needs one anyway to let both sides submit before anything resolves.

The check resolver picked up real (if minimal) randomness for this: a
uniform -1/0/+1 nudge to the attacker's effective value, meet-or-beat to
succeed (`modules/checks/index.js`) — with equal stats that's a 2/3 hit
chance, chosen over a coin-flip because a two-outcome jitter can only ever
land at 50/50, never the intentionally-uneven split.

*Full design (planned, not built):* `cemote <target> <freeform text>`
replaces the auto-attack producer for a theme that wants it, submitting into
the batched round engine described above instead of firing on an
independent timer. Target is always a structured argument — resolved by
keyword-match against session participants, the same mechanism `get`/`give`
already use, defaulting to the sole other participant in a 1:1 fight — and
is never inferred from the free text. Only the text after the target gets
scanned, which closes off "matched a keyword near the wrong name" as a bug
class rather than requiring smarter parsing to work around it. Matching is a
strict allowlist over whole tokens with explicitly enumerated synonyms
authored in content (e.g. `"swing"` and `"swings"` recognized, `"swung"`
deliberately not) rather than stemming — predictable over clever. Verb
keywords select an attack type; adverb/style keywords apply transient
modifiers using the existing `{tag, operation, amount}` shape `stats.js`
already folds. Defense keywords (dodge/block) and utility keywords (stamina
recovery, etc.) reuse the identical mechanism against a different effect
target — no new engine concept, just more content.

**Regen and room-wide messages (built).** `modules/combat/regen.js`'s
`startRegenTicker(world)` (called once from `game.js`) heals every online
character's `vitality`-role stat by a flat 1 every 30 seconds, capped at
that stat's content-defined `startingValue` — the closest thing to a "max
hp" that exists, since the stats system has no separate current/max split
(base *is* current). Deliberately unconditional: same rate whether a
character is mid-fight, defeated, or just standing around, no "resting
heals faster" concept yet. This is what keeps a defeated character (`hp`
at 0) from staying there forever.

`modules/combat/index.js`'s attack/damage/defeat listeners now also
broadcast a third-person version of each message to bystanders in the
combatants' room (`writeToSocket` to everyone there except the two direct
participants, who already got their own message). Reaching bystanders
needs a room lookup by `character.roomId`, which needs `world` — threaded
in via `setWorld(world)`, called once from `game.js` alongside
`startRegenTicker`, rather than passed through every call site between a
timer tick and the listener. Assumes both combatants share a room, true
for every way v1 can start or continue a fight.

Not built yet: the round/`pendingActions` batching engine itself; the
`cemote` lexicon/parser; loot/currency/win-state beyond "combat ends"; a
wielded-weapon concept (v1 is unarmed-only); and m:n-aware re-targeting
when your target dies mid-fight but others remain (v1 just leaves you idle
rather than auto-picking a new target — see `session.js`'s note on it).

## Containers: size gates what fits, weight gates how much

Items can now hold other items - a pouch, a backpack, a chest, all just
regular `content/items.json` entries, no special-cased item types. Two
axes, both needed:

- **`size`** (`"small"`/`"medium"`/`"large"`, ordered) gates *what* fits -
  a container declares the largest item size it accepts.
- **`weight`** (a plain number) gates *how much* fits in aggregate - a
  container declares a total weight budget its contents can't exceed.

Every `Item` carries `size`/`weight` (defaulting to `"small"`/`1` if
content omits them, so existing entries like `rusty-key` didn't need
edits) and an optional `container: { maxItemSize, capacityWeight }` -
its *presence* marks the item as a container, the same way
`character.components.combat`'s presence marks "currently fighting."
`modules/containers.js` is the generic mechanism (`isContainer`,
`canContain`, `getEffectiveWeight`) - it knows the shape, never which
items in content are containers or what they're called, same split as
`stats.js`/`checks/`. A container's contents live in the item's own
`inventory` array, the same field `Character`/`Room` already use - which
means **`drop`/`give` needed zero changes**: moving a container moves
whatever's inside it, for free, since it's the same object.

One consequence worth calling out: since a chest is `large` and a
backpack only accepts up to `medium`, **a chest can't be stuffed into a
backpack or a pouch** - no special-casing, just the same ordinal check
that rejects any other oversized item. `canContain` also rejects putting
a container into something it (transitively) already contains - the
size check alone doesn't catch this once two containers happen to share
a size class (two backpacks, say), so it's an explicit cycle check.

`getEffectiveWeight` is recursive: a full backpack weighs more than an
empty one, so a container's capacity check weighs incoming items against
what they actually carry, not just their own base weight.

New verb: `put <item> [in] <container>` (`modules/commands/put.js`). `get`
gained an optional `get <item> [from] <container>` form alongside its
existing `get <item>` (room floor); `look <container>` now lists
contents. `in`/`from` are optional/cosmetic, stripped the same way
`give.js` already strips a leading `to` - the container keyword is just
whatever comes after the item keyword. All three find the container by
keyword in the character's own inventory first, then the room floor -
same order `look` already searched in - and none of them reach into a
container that's itself stowed inside another container; it has to come
out first.

Not built yet: character carry-weight/encumbrance (no character-side max
weight exists, so picking up a chest works exactly like picking up
anything else); equipping/wearing. Also unrelated to containers but worth
repeating here: dropped/placed room items still don't survive a server
restart (only character inventories persist - see Phase 2's persistence
note above) - a chest full of loot resets on reboot same as anything
else on the floor.

## `emote`: inline @/# targeting, separate from the planned `cemote`

`emote <text>` (`modules/commands/emote.js`) is freeform third-person
action text - `Character <text>.` to the room, `You <text>.` back to the
actor - with one goodie: a token starting with `@` names a character (by
keyword, searched in the room), a token starting with `#` names an item
(by keyword, searched in the actor's inventory then the room floor - same
order `look`/`put` already search in). Both resolve to that entity's real
name in the broadcast text; an unresolved `@` falls back to `"someone"`,
an unresolved `#` to `"something"`, rather than failing the whole emote
over one bad keyword.

This is a **separate, simpler mechanism** from the `cemote` design
sketched in the Combat section above - inline references found anywhere
in free text, not a leading structured target argument plus a
verb/modifier keyword lexicon. Emote has no attack/defense semantics to
drive; it only needs "who/what does this word refer to."

Same trailing-period rule as `say` (added only if the text ends in a
letter or number, everything else left as typed) - but unlike `say`, the
text is never capitalized. It isn't standing alone in quotes; it's glued
directly onto the character's name, which already supplies the capital.

Known, deliberately unfixed wart: the actor's own line reuses the same
text as everyone else's, so third-person verbs read wrong for `You`
("You tosses..."). Fixing that means conjugating every emote per viewer,
which isn't specific to `emote` - it's the same `You <verb>` pattern
every command in the codebase already uses for its own actor-facing
line. Wants its own pass across all of them once it's worth doing, not a
one-off fix here.

## Item qualifiers: ordinal (2.x) and cardinal (N*x) keyword matching

`modules/itemSearch.js`'s `resolveItemToken` replaces the ad-hoc
`items.find(i => i.keywords.includes(keyword))` that `get`/`put`/`drop`/
`give`/`look`/`items`/`emote`'s `#` all used to duplicate, and adds two
optional qualifiers on top of a plain keyword: `2.pouch` (ordinal - the
2nd match) and `3*brick` (cardinal - the first 3 matches). Both reduce to
the same question - "are there at least N matches for this keyword, in
this search scope?" - so the resolver finds every match once, in the
same priority order each command already searched in (inventory then
room, etc.), then either indexes into it or takes its front slice.
Plain, unqualified keywords are unchanged: first match, same as before.

**Fail the whole command, not a partial one.** Asking for more than
exists - `2.pouch` with only one around, `3*brick` with only two -
rejects the entire command with `There aren't N things matching "x"
here.`, nothing moved. `put` extends this to a batch capacity check:
`canContainAll` (`modules/containers.js`) weighs the *whole* batch
cumulatively against a container's budget before moving anything, not
each item against the container's still-empty current state one at a
time - three items that individually fit a container can still
collectively overflow it. `canContain` is now just `canContainAll` for a
single item, so single-item and batch puts share one code path.

**Grouped `"xN"` phrasing for multi-item messages**, not pluralization:
`You pick up a 0.5 lb brick (x3).` Item names already carry their own
article (`a 0.5 lb brick`), which naive pluralization can't handle in
general (irregular nouns) without content opting in per item, and a
cardinal match isn't even guaranteed to be N of the *same* item -
`3*brick` can pull a mix of different brick weights, all matching
`"brick"`. `formatItemList` groups by name (`a 0.5 lb brick (x2), a 1 lb
brick, and a pouch`) instead, which stays correct either way.

**Scoped to items only.** `@` character targeting (in `emote`, `give`'s
recipient, `whisper`) has no ordinal/cardinal support yet - a separate
decision if it turns out useful, not assumed here.

**One extra wrinkle for `emote`, spelled out because the two look
similar:** an *unqualified* `#`/`@` that finds nothing still falls back
to `"something"`/`"someone"` and the emote proceeds - a typo in
otherwise-fine freeform text shouldn't nuke the whole thing (existing
behavior, unchanged). A *qualified* `#` that can't be satisfied aborts
the entire emote instead - nothing broadcasts, same atomic-failure rule
as everywhere else - because that's a specific, deliberate request that
plainly can't be met, not a vague reference worth papering over.

## Known gap: no input rate/size limiting

`server.js`'s per-connection line buffer (`modules/utils.js`'s
`extractLines`, added to fix real line-splitting bugs against clients like
Windows' `telnet.exe`) has no cap on either axis:

- **Command flooding.** A pasted block of many newline-separated commands
  (e.g. a hundred `north`s) gets fully drained in one synchronous pass of
  the `"data"` handler's loop — no per-connection rate limit, no cooldown
  between commands. Functionally identical to sending the same commands
  one at a time very fast, but without the natural interleaving-with-other-
  connections that separate packets get from the event loop; a large
  enough paste can stall the server for everyone during that pass.
- **Unbounded buffer growth.** Nothing caps how long `socket.lineBuffer`
  can grow while waiting for a `\n` — a client that sends a large chunk
  with no newline at all just keeps that string growing.

Deliberately not fixed yet — real user count is 1-2 people who can just be
careful about what they paste for now. Needs a real design pass (hard cap
vs. throttle-and-queue, what a client that trips it sees) before opening
the server up beyond that, not a reflexive fix bolted on here.
