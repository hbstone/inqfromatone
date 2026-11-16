# Notes for Claude sessions

ARCHITECTURE.md is the design record and ROADMAP.md the plan; this file is
the short list of things to check while writing code.

## Shared helpers: look before writing one

Before writing a small utility (text cleanup, time math, naming someone in
a message, saving a file), check this list and grep for the obvious name.

- **Rule of two.** Write a helper where it's first needed. When a second
  place needs it, move it into a shared module (the first copy, not a new
  one) and add it here. Don't pre-extract things with one caller.
- **Keep this list current** when adding or moving a shared helper.

**Text**

- `modules/text.js`: `normalizeText` (lowercase, punctuation to spaces),
  `wordsOf` (those words minus articles), `endSentence` (a period unless it
  already ends in punctuation), `ARTICLES`.
- `modules/recognition/index.js`: `targetableKeywordsOf` makes the
  keywords a character is targeted by. It splits on spaces only, on
  purpose, so "whiskey-soaked" stays one. Not interchangeable with
  text.js's `wordsOf`.
- `modules/color.js`: `capitalizeFirst` (skips leading color codes),
  `stripColors`.
- `modules/keywordMatch.js`: `keywordMatches` (does a typed token match
  someone's or something's keywords).

**People and messages**

- `modules/utils.js`: `sendTo(character, message)` (no-op for NPCs and the
  disconnected).
- `modules/naming.js`: `tellRoom(room, viewer => ...)` for the room, with
  `nameFor(subject, viewer)` for anyone named in it; `findCharacter` and
  `keywordsFor` for what a viewer can type to mean someone.
- `room.others(character)`: everyone else in the room.
- Finding someone online: `World.findOnlineCharacterByKeyword` is fuzzy
  (for `tell`); `modules/connection.js`'s `findInWorldCharacter` is exact
  (for logins). Different on purpose.
- `modules/presence.js`: `presenceOf`, `presenceLine`.
- `modules/commands/say.js`: `formatSpeech` (capitalized, ends a sentence),
  for anything said out loud.

**Movement**

- `modules/commands/move.js`: `movePlayer` (the one place rooms change,
  with all the events and messages), `OPPOSITES`.
- `modules/npcs/routine.js`: `firstStepToward` (pathfinding by exits).

**Items**

- `modules/itemSearch.js`: `resolveItemToken` (`2.key`, `3*arrow`),
  `itemDisplayName`, `formatItemList`.
- `modules/stacking.js`: `addItem`, `takeMatch`, `moveMatches`.
- `modules/containers.js`: `canContain`, `canContainAll`,
  `getEffectiveWeight`. `modules/equipment.js`: `canEquip`, `isEquippable`.

**Stats and checks**

- `modules/stats.js`: `getStatValue`, `initStat`, `adjustBaseStat`,
  `setModifier`, `removeModifier`.
- `modules/content/loadStatDefinitions.js`: `getStatKeyForRole` (find "the
  offense stat" without naming it), `getStatDefinition`.
- `modules/checks/registry.js`: `resolveCheck`.

**Time**

- `modules/gameClock.js`: `getGameTime` (day/hour/minute/phase),
  `gameMinutes` (one running count, for "how long ago"),
  `MINUTES_PER_DAY`, `getPhaseStartHour`.
- `modules/scheduler.js`: `every`, `after`.

**Files**

- Content and config: `modules/content/readJson.js`'s `readJson(path,
what)`, which names the file in errors.
- Saves: `modules/atomicWrite.js`'s `readJsonFile` (missing means null)
  and `writeJsonAtomic`; folders from `modules/saveDirs.js`
  (`charactersDir`, `roomsDir`, `npcsDir`).

**Content**

- `modules/content/keys.js`: `KEY_PATTERN`, `assertValidKey` (also used
  for pack and game names).
- `modules/content/mergeByKey.js`: `mergeByKey`, `sourceName`;
  `assertUniqueKeys`.
- `modules/content/loadWorldData.js`: `resolveRoomRef`, `resolveItemRef`
  (relative ids in content).

**Hooks for packs**

- `modules/events.js`: `on`, `emit`.
- Registries: `registerCommand`, `registerBehavior` (NPCs),
  `registerCheckResolver`, `registerQuitBlocker` (`modules/commands/quit.js`).
- `modules/packs/context.js`: what a pack's `index.js` is handed.

**Odds and ends**

- `modules/guard.js`: `guard` (one failure doesn't take down the rest).
- `modules/npcs/behaviors.js`: `pick` (random choice, testable).
- `modules/npcs/senses.js`: `canSense(character, sense)` before an NPC
  perceives anything.

**Tests**

- `tests/helpers.js`: `fakeSocket`, `makeCharacter(name, props)`,
  `lastMessage`.

**Single-use for now; promote on a second caller:** `bareName` in
`packs/western/lib/tip.js` (an item name minus a/an/the/some), and the
shuffle inside `modules/npcs/behaviors.js`.

## Known traps

- **Import cycle through gameClock.js.** gameClock → packs/game.js → the
  content loader → NPC dialogue/knowledge → gameClock. Modules in that
  loop can use gameClock's exports inside functions, but not at load time
  (top-level constants); that throws "Cannot access ... before
  initialization".
- **Windows:** Python's `open()` defaults to cp1252 here, so pass
  `encoding='utf-8'`. Put long edit scripts in a file rather than an inline
  shell heredoc. Run `pnpm format` before committing.
