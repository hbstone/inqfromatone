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

| Need                                                        | Use                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normalize typed text, words minus articles                  | `modules/text.js`: `normalizeText`, `wordsOf`, `ARTICLES`                                                                                                    |
| Keywords to target a character by (spaces only, on purpose) | `modules/recognition/index.js`: `wordsOf`. Different from text.js's; see the comments                                                                        |
| Does a typed token match keywords                           | `modules/keywordMatch.js`: `keywordMatches`                                                                                                                  |
| Find an item from what was typed (`2.key`, `3*arrow`)       | `modules/itemSearch.js`: `resolveItemToken`, `itemDisplayName`, `formatItemList`                                                                             |
| Name someone in an in-character message, per viewer         | `modules/naming.js`: `nameFor`, `keywordsFor`, `findCharacter`, `tellRoom`                                                                                   |
| Capitalize a line (skips leading color codes)               | `modules/color.js`: `capitalizeFirst`                                                                                                                        |
| Game time                                                   | `modules/gameClock.js`: `getGameTime` (day/hour/minute/phase), `gameMinutes` (one running count, for "how long ago"), `MINUTES_PER_DAY`, `getPhaseStartHour` |
| Run something later or repeatedly                           | `modules/scheduler.js`: `every`, `after`                                                                                                                     |
| Read/write a save file safely                               | `modules/atomicWrite.js`: `readJsonFile`, `writeJsonAtomic`; folders from `modules/saveDirs.js`: `charactersDir`, `roomsDir`, `npcsDir`                      |
| Hooks between core and packs                                | `modules/events.js`: `on`, `emit`. Registries: `registerCommand`, `registerBehavior` (NPCs), `registerCheckResolver`                                         |
| Merge keyed content across packs                            | `modules/content/mergeByKey.js`: `mergeByKey`; `assertUniqueKeys`                                                                                            |
| Keep one failure from taking down the rest                  | `modules/guard.js`: `guard`                                                                                                                                  |
| Pick one at random (testable)                               | `modules/npcs/behaviors.js`: `pick`                                                                                                                          |

## Known traps

- **Import cycle through gameClock.js.** gameClock → packs/game.js → the
  content loader → NPC dialogue/knowledge → gameClock. Modules in that
  loop can use gameClock's exports inside functions, but not at load time
  (top-level constants); that throws "Cannot access ... before
  initialization".
- **Windows:** Python's `open()` defaults to cp1252 here, so pass
  `encoding='utf-8'`. Put long edit scripts in a file rather than an inline
  shell heredoc. Run `pnpm format` before committing.
