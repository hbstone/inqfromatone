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
