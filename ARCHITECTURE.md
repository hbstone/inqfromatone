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
