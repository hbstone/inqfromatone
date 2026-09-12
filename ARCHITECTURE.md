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

**V1 (built):** `modules/combat/index.js` registers a single
always-available attack producer (`statKey` = the `offense` role,
difficulty = the defender's `defense` role value) via
`registerAttackProducer()` (`modules/combat/registry.js`, single-slot like
the checks resolver). Damage is a flat 1 unarmed, or a wielded weapon's
`components.weapon.damage` when one's equipped (see the Equipment section
below) — same producer either way, it just checks `equipment.weapon` each
time rather than switching producers.
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
`cemote` lexicon/parser; loot/currency/win-state beyond "combat ends"; and
m:n-aware re-targeting when your target dies mid-fight but others remain
(v1 just leaves you idle rather than auto-picking a new target — see
`session.js`'s note on it).

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

## Fuzzy (substring) keyword matching

`modules/keywordMatch.js`'s `keywordMatches(keywords, token)` is the one
place every item- *and* character-targeting command now checks whether
what someone typed refers to something: a token matches if it's a
substring of any one of the entity's keywords, not just an exact match -
`get bri pou` finds "a brick" in "a pouch" the same way `get brick pouch`
would. Deliberately no minimum length: even a single character matches
(`get b p`), at the risk of also matching whatever else happens to share
it - predictable over clever, and not a fuzziness threshold worth
inventing before it's actually a problem in play. Composes for free with
the `2.x`/`N*x` item qualifiers above, since those only ever wrap a
keyword string, never caring how it gets matched (`2.bri` ordinal-selects
across every "contains bri" match, same as `2.brick` did before).

Applies everywhere a command already matched by keyword: item lookups
(`modules/itemSearch.js`, so `get`/`put`/`drop`/`give`/`look`/`items`/
`emote`'s `#` all get it automatically) and character lookups (`give`'s
recipient, `whisper`, `kill`, `look`, `emote`'s `@`, and `tell` via
`World.getOnlineCharacterByName` - which used to be an exact, global
full-name match; it's now a fuzzy keyword search across every online
character instead, reusing `getOnlineCharacters()`). Every one of those
call sites used to hand-roll its own `char.keywords.includes(...)` (one
of them, `look`'s character fallback, without even lowercasing first -
a latent bug fixed for free by centralizing this); now there's one
function that owns both the substring check and the lowercasing.

Not extended to ordinal/cardinal - `2.bae`/`3*bae` for characters isn't
built, a separate decision if it turns out useful, same as the item
qualifiers' own scoping note above.

## Equipment: named slots, closing the wielded-weapon gap

`modules/equipment.js` is the other Phase 2 item the roadmap named
(alongside stats and containers, both already built) — a character can now
have items equipped into named slots, not just carried loosely in
`inventory`. Deliberately mirrors `containers.js`'s split: the engine only
knows the generic shape and validates (`isEquippable`/`canEquip`), the
calling command does the actual array/map mutation, same division as
`canContainAll` vs. `put.js`.

An item is equippable exactly when its `equip` field (`{ slot }`) is set —
same presence-marks-it convention as `container`. `character.equipment` is
a plain `slot -> Item` map (not an array; a slot holds at most one item),
persisted alongside `inventory` in `toSaveData`/`restoreFrom`, recursing
through `Item.toSaveData`/`fromSaveData` the same way. Slot names are open
strings core never enumerates — same pattern as a stat's `role` tag — with
one blessed exception, same status as `vitality`/`offense`/`defense`:
`modules/combat/index.js` recognizes `weapon` as a slot it cares about,
because combat is the concrete near-term consumer. No other slot is
core-recognized; `head` (see `content/items.json`'s `leather-cap`) exists
purely to prove two independent slots don't interfere with each other, not
because armor mechanics are built.

**`wear <item>` / `wield <item>`** (`modules/commands/wear.js`) are the
same mechanism registered under two verbs, purely because which word reads
naturally depends on the item ("wear a cap", "wield a sword") — there's no
behavioral difference, so both are thin wrappers around one
`makeEquipCommand(verb)` factory rather than duplicated logic. Both only
search the character's own inventory (equipping something across the room
isn't a thing) via `itemSearch.js`'s `resolveItemToken`, so fuzzy/keyword
matching applies the same as `get`/`drop`. A cardinal match (`3*ring`) is
rejected outright — there's no sensible single-slot outcome for equipping
more than one item in the same command, so it fails rather than silently
picking one. An already-occupied slot also fails outright (`canEquip`) —
no auto-swap; `remove` is a separate, explicit step.

**`remove <item>`** (`modules/commands/remove.js`) is the inverse, and
deliberately doesn't route through `resolveItemToken` — equipment is a
slot-keyed map, not an array, so there's no `source` array to splice from.
A plain `keywordMatches` scan across whatever's currently equipped is all
a handful of slots needs (same reasoning as `look.js`'s character-lookup
fallback, which also bypasses `itemSearch.js` for the same shape reason).

**Combat integration:** `modules/combat/index.js`'s attack producer reads
`attacker.equipment?.weapon?.components?.weapon?.damage`, falling back to
the unarmed flat default when nothing's equipped there. A weapon's damage
lives in `components.weapon` — theme data on the item, the same
`components.firearm = { ammo: 6 }`-shaped example ARCHITECTURE.md's
component-model section already used — not a field `equipment.js` or the
producer's shape needs to know about beyond reading it once combat cares.
This closes the gap the Combat section above used to flag explicitly (v1
was unarmed-only because no wielded-weapon concept existed).

**Stat modifiers from equipped gear (built).** `item.components.equipStats
= { modifiers: [{ key, operation, amount }] }` — theme data, same
convention as a weapon's `components.weapon.damage`, not a field
`equipment.js` itself knows about. `wear`/`wield` apply each modifier via
`stats.js`'s existing `setModifier(character, key, tag, operation,
amount)` on equip; `remove` strips them via `removeModifier` using the
same tag. The tag is `equip:<slot>` — one slot only ever holds one item,
so tagging by slot (not item identity) is enough for `remove` to find and
strip exactly what that item applied, however many stats it touched.
`leather-cap` now grants `+2 dexterity` (the `defense`-role stat) as the
real consumer.

**`equipStats` is entirely optional — no `+0` placeholder needed.**
Purely decorative wearables (`fancy-hat`, same `head` slot as
`leather-cap`, an alternative rather than a strict upgrade) just omit the
component; `wear`/`remove` loop over `?? []` and no-op. This was a choice
over requiring an explicit zero-amount modifier per costume: less content
boilerplate, and "no consumer, no data" is the same convention already
used for `container`/`equip` themselves.

Not built: armor/defense mechanics beyond a flat stat bump (no
damage-reduction/absorption concept, just modifying the same `defense`
role combat already reads); slot restrictions by character type/class
(anyone can equip anything with a matching slot).

## Room/world state persistence

Closes the gap the Containers section flagged: dropped/placed room items
used to reset on every restart, since `loadWorldData` was the only source
of room inventory. `worldData.js` is a second small storage adapter next
to `data.js` - same shape (`roomStateExists`/`loadRoomState`/
`saveRoomState`), one JSON file per room under `rooms/`, keyed by the
room's content-authored `key` rather than a player-supplied name, so
there's no path-traversal allowlist concern to replicate from `data.js`.
Only a room's mutable state is saved - `inventory` and the `components`
bag `Room` already carried but nothing wrote to yet - never
name/description/exits, which always come from content.

**Trigger: periodic + graceful-shutdown, not save-on-mutation, for now.**
Characters save at a clean boundary (quit/disconnect); a room has no
equivalent single moment; a chest three players filled an hour ago has no
"session" to end. `modules/worldPersistence.js`'s `startWorldSaveTicker`
mirrors `combat/regen.js`'s ticker shape - every 60s, save whatever's
dirty. `server.js` also now handles `SIGINT`/`SIGTERM` to save immediately
on a graceful stop, so a normal dev `Ctrl+C` doesn't lose the last
interval. A hard crash can still lose up to one interval's changes -
accepted for now, same "1-2 real users" reasoning already used elsewhere
in this doc to defer stronger guarantees.

**Dirty-tracked, not whole-world, writes.** `Room` gained a `dirty` flag
and `markDirty()`. Command handlers that mutate a room's inventory -
`drop`, `get` (both the room-floor and from-a-room-floor-container forms),
`put` - call `room.markDirty()` right after, checking each match's
`source` against `room.inventory` where a container could belong to
either the room or the character (see `get.js`/`put.js`). `saveDirtyRooms`
only writes rooms with the flag set, clearing it after - a tick where
nothing changed writes nothing, and a tick where one room changed writes
only that room's file, not a snapshot of the whole world. `give` needed no
changes; its item source is always the giver's own inventory, never a
room.

This is deliberately structured as a stepping stone toward save-on-
mutation, not a dead end: `markDirty()` is already the exact call site a
future switch would reuse - only what happens *after* `markDirty()` (an
immediate/debounced save vs. a ticker polling the flag) would change, not
the command handlers that call it. Chosen over building save-on-mutation
now because a ticker needed no per-command save-call plumbing beyond the
dirty flag itself, and de-risks the "does the save/restore shape work at
all" question before adding a second concern (save timing/coalescing) on
top of it.

Startup order: `loadWorldData` seeds every room from content as before,
then `loadRoomStates` overlays any saved state on top, replacing the
content-seeded inventory/components for rooms that have a save file. A
room with no save yet (first boot, or a room newly added to content) just
keeps its content default - same "new vs. existing" split character login
already uses.

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

## Currency/economy: deferred to Phase 3, decision notes for later

Discussed but not built. Most of Phase 2's list (combat, stats, equipment,
containers, persistence) is done; currency/economy is the one item pushed
out, since it doesn't mean much without something to spend it on — there's
no NPC/vendor yet (Phase 3), and "combat drops currency" is a real but
separate small piece (see the still-unbuilt "loot/currency/win-state"
note in the Combat section above).

- **Source of truth is a ledger component, not physical `Item`s.**
  `character.components.currency = { amount }`, mirroring the
  `caster.mana`/`firearm.ammo` component examples earlier in this doc, not
  N gold-coin `Item` objects. This persists for free through the existing
  `components` serialization in `Character.toSaveData`/`restoreFrom` — no
  new plumbing needed for that part. Content supplies the display name
  ("gold", "credits", whatever a theme wants), same identity-vs-mechanism
  split as stats.
- **Single scalar, not denominations, until something needs otherwise.**
  Copper/silver/gold conversion is real MUD flavor but pure overhead
  (conversion rates, "making change") with no current consumer — same
  "don't build ahead of a concrete need" call already made for the
  humoral stat system and equipment slot restrictions above.
- **Physical coins, if wanted, are generated on demand, not stored.**
  Dropping money or putting it in a container should still work without
  making the ledger and physical coins two parallel sources of truth for
  the same value: converting N off the ledger materializes an `Item` (or
  stack) placed in the room/container, and picking it back up converts it
  back into the ledger. The ledger stays canonical either way.
- **No longer blocked on stacking mechanics** — item stacking (below) now
  covers both merging and splitting, so a physical coin pile could
  accumulate, move, and have part of it peeled off. Still nothing to
  actually build here until currency/economy itself is picked back up
  (see the top of this section) — this bullet is just noting the
  prerequisite is no longer the reason to wait.

## Item stacking (built): merging and splitting, deliberately no max size

Raised independent of currency — arrows, food, and anything else that's
"many of the same small thing" hit the same wall `content/items.json`'s
five separate `brick-one` entries paper over: every unit used to be its
own `Item` object. `modules/stacking.js` is the generic mechanism, same
one-small-file-per-mechanism split as `containers.js`/`equipment.js`: an
item is stackable exactly when its `stackable` field is `true` (opt-in —
existing proof content like the bricks/pouches is left unmarked, keeping
its original "N separate objects" behavior unchanged), and
`addItem(destination, item)` merges a stackable item into a same-named
existing stack in that array instead of appending a second entry.
`Item` gained a `quantity` field (default 1) alongside it, persisted the
same way `size`/`weight`/etc. already are. `get`/`drop`/`give`/`put` all
call `addItem` instead of a raw `.push()` for the item(s) they move, and
`loadWorldData` does too — so content can seed a starting pile by
repeating a stackable key in a room's `items` list (`content/items.json`'s
`arrow`, ten of them in the storage room), the same convention already
used for the non-stackable bricks, and it collapses into one stack at
load instead of staying ten objects.

**Identity is `name` equality, not a new field.** Two stackable items
merge when they share a `name` — the same thing `itemSearch.js`'s
`formatItemList` already treats as "the same kind of item" for display
grouping, so this isn't a new notion of sameness, just reusing the
existing one. `getEffectiveWeight` (`containers.js`) and `formatItemList`
were both updated to multiply/sum by `quantity` rather than assuming 1
per object — the latter means a single 20-arrow stack and twenty separate
identically-named objects render identically (`an arrow (x20)`), so nothing
downstream needs to care which shape produced the count.

**No max stack size.** The classic reason one exists (99-per-slot, spill
into a second stack) comes from grid-inventory UIs rationing slots — this
is a text MUD with no slot concept, so that pressure doesn't exist here.
Weight/container capacity already provides a real, non-arbitrary ceiling
(a container's `capacityWeight` budget rejects further adds once a stack
gets heavy enough) via the same mechanism every other item already uses,
rather than inventing a parallel cap. If a concrete reason shows up later
(a themed "a quiver holds 40 arrows" rule, say), that's a `maxQuantity`
field for `addItem` to enforce — additive, not a redesign — not something
to build ahead of an actual need.

**Stack splitting (built): cardinal now counts units, not objects.**
`itemSearch.js`'s `N*keyword` qualifier used to mean "N distinct
matching objects" — meaningless once `addItem` merges same-named
stackables down to one object, since `5*arrow` against a single 20-arrow
stack found only one object and failed with "there aren't 5 things
matching arrow." It now means N *units*: `resolveItemToken`'s cardinal
path sums each match's `quantity` (1 for anything non-stackable, so
existing content's behavior is unchanged — object-counting and
unit-counting coincide when every object holds exactly 1) and walks
matches in order, taking a whole object while there's enough count left
and, for whichever object would otherwise overshoot, recording a
*partial* claim (a `quantity` less than that object's own) instead.

**The split itself is deferred to the moment a command commits.**
`resolveItemToken` stays read-only — a partial claim is just a number
attached to the still-whole, unmutated object, not a completed split.
`modules/stacking.js` gained `takeMatch` (turns one match into the actual
item to move — the real object for a full claim, or a fresh split-off
`Item` via a new internal `splitStack`, decrementing the original in
place, for a partial one) and `moveMatches` (the shared move-and-merge
step get/drop/give/put now all call, replacing their previous hand-rolled
splice-then-push loops). Splitting only ever happens inside `takeMatch`,
so a command that resolves matches but bails out before moving anything
(put.js's capacity check failing) or a purely read-only command
(look, items, emote's `#`) never mutates a stack it only inspected.

**`previewMatch` (itemSearch.js) is the read-only stand-in for "what a
match would actually be."** Returns the real object, identity intact, for
a full claim — necessary because `canContainAll`'s self/cycle checks
compare object identity — or a shallow clone carrying just the claimed
quantity for a partial one. Every display (`formatItemList`,
`describeItem`) and pre-move validation (put's `canContainAll`) that
used to read `match.item` directly now goes through this first, so a
message or a weight check reflects the actual claimed amount instead of
the whole (not-yet-split) object's current quantity.

**Deliberately still asymmetric: plain `get arrow` takes the whole
stack, not one unit.** The intuitive-looking equivalence "`get arrow`
== `get 1*arrow`" was considered and explicitly deferred — plain-keyword
matching keeps meaning "the whole matched object," same as it always
has for any item, stacked or not. `1*arrow` does now peel off exactly
one unit (cardinal's unit-counting applies at N=1 same as any other N),
so the two forms are deliberately *not* the same command right now; revisit
once it's clear from play which default actually feels right.
