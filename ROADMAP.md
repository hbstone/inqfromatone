# Roadmap

This document captures the long-term design direction for the project: separating
game **mechanics** (engine) from **theme** (content), and building a tiered NPC
"brain" system that can scale from cheap scripted behavior up to full AI-driven
autonomy. It's a planning reference, not a spec — expect it to evolve as phases
are actually built.

## Goals

1. **Mechanics/theme separation.** The core engine (networking, world model,
   command dispatch, persistence, scheduling) should not know or care whether
   it's running a medieval fantasy game, a western, or a space opera. Someone
   should be able to build a "magic" content pack or a "guns" content pack on
   top of the same base without forking the engine.
2. **Tiered NPC brains.** NPCs should be able to run on cheap, mostly-scripted
   behavior most of the time, and escalate to full AI reasoning only when a
   situation actually calls for nuance — then fall back down to cheap behavior
   again.

Full separation isn't fully achievable — whatever theme is built first will
inevitably shape what a `Room`, `Character`, or `Item` means at a basic level.
The goal is "reasonably separate, with the seams found and fixed early,"
not "perfectly generic on the first try."

## Scope sanity check

Neither goal is unreasonable, but they carry different risk:

- **Engine/content separation** is well-trodden — this is how mature MUD
  engines and most game engines are structured. It's mostly a refactoring
  discipline problem.
- **Tiered NPC brains with live escalation** is more novel, but it maps onto a
  concept game AI already has a name for: **Level of Detail (LOD)**, applied
  to cognition instead of graphics. Cheap/dumb when a player isn't paying
  attention, expensive/smart when they are. Sound pattern, not a fantasy.

The main scope risk is sequencing: building Tier 3 AI before there's a game
clock, an event system, and a knowledge store means rebuilding it later. The
boring plumbing needs to come first.

## Architecture: engine vs. content

Treat this as a plugin system from the start, even before a second theme
exists.

- **Engine (core, theme-agnostic):** networking, the `World` container, an
  entity system, command dispatch, an event bus, a game clock/scheduler,
  persistence, the NPC brain switchboard. None of this should know what
  "mana" or "hyperdrive" means.
- **Content packs (theme-specific):** room/item/NPC data, verb handlers
  (`cast`, `shoot`, `jump`), flavor text, dialogue trees, brain scripts. A
  fantasy pack and a western pack both sit on top of the same engine.

Concrete changes to get there from the current codebase:

- **Entities as attribute/component bags, not theme-flavored classes.**
  `Character` is currently generic (good) — keep it that way. When
  spells/six-shooters/etc. are added, resist adding fields like `mana` or
  `ammo` directly to the base class. Instead attach components a theme pack
  owns, e.g. `{ combat: {...} }`, `{ caster: { mana: 50 } }`,
  `{ firearm: { ammo: 6 } }`. This is the single biggest lever for keeping
  mechanics and theme separable.
- **Commands as a registry, not static exports.**
  `modules/commands/index.js` is already close to this shape — evolve it into
  `registerCommand('cast', handler)` that theme packs call, instead of a fixed
  list of exports. Core ships `look`, `get`, `drop`, movement, `tell`; themes
  add their own verbs without touching core files.
- **An event bus**, so theme packs hook behavior instead of editing core
  logic directly: `onEnterRoom`, `onCommand`, `onDamage`, `onTick`, `onDeath`.
  Without this, "add magic" inevitably means patching `game.js`.
- **Data-driven definitions** for rooms/items/NPC templates (JSON or similar),
  loaded from per-pack data directories, instead of hardcoded in JS. This also
  makes a second theme pack a real test of the abstraction instead of a
  rewrite.
- **A game clock/scheduler**, built as core engine, not theme content — needed
  for NPC daily loops regardless of theme, and a prerequisite for Tier 1
  brains to mean anything.

Expect the first theme pack to still leak into the core somewhat. The way to
find the real seams is to stub a thin *second* theme pack early (even just
re-skinned rooms/items with one custom verb) as a forcing function, rather
than trying to design the separation perfectly on paper.

## NPC brains as cognitive LOD

Four tiers, with one addition beyond "brain": a **knowledge store** that is
separate from whichever brain is currently active.

| Tier | Name | Behavior | Cost |
|---|---|---|---|
| 0 | Reflex | Attribute/behavior-tag driven (aggressive, can_move, wanders) — weighted-random action selection | ~free |
| 1 | Routine | Authored schedule / behavior tree per "job" (e.g. blacksmith's day), with fallback branches for blocked paths or missing items/NPCs | cheap, deterministic |
| 2 | Scripted Dialogue | Keyword/topic-triggered branching dialogue trees — canned but structured, can reference NPC knowledge | cheap |
| 3 | Autonomous AI | LLM-driven, has goals + memory, takes actions via tool calls into real game verbs | expensive, use sparingly |

### Knowledge store

Every NPC gets a persistent "what I've seen/heard/been told" log that's
independent of which brain tier is currently active. This is what makes
tier-switching cheap and coherent:

- Tier 1/2 can answer simple questions ("have you seen the merchant?") from
  the store without needing AI.
- When escalating to Tier 3, the AI isn't starting cold — it's handed the
  existing knowledge as context rather than regenerating a personality from
  scratch.
- When AI reasoning produces new facts/decisions, they get written back to
  the store so lower tiers stay consistent after de-escalation.

### Switchboard

A dispatcher runs on each interaction: check trigger rules (a keyword hits a
"needs nuance" flag, the speaker is tagged `authority_figure`, quest state
requires it) and either handle it at the current tier or request a tier
bump. The switchboard itself lives in the engine (theme-agnostic); the
*trigger rules* are content-authored per NPC/theme.

### Cost-saving "compile down"

Rather than answering once and staying expensive, Tier 3 can emit a
Tier-1-shaped schedule/state-machine patch as part of its response — e.g.
"for the rest of today, avoid the tavern, mention the theft if asked" — which
the cheap Tier 1 interpreter then runs until a new trigger forces
re-planning. Design this as a first-class capability rather than a bolt-on;
it's what keeps AI calls rare instead of per-message.

## Safety / guardrails (document now, build later)

These are known pitfalls for this design. They don't need to be solved before
Phase 1, but they need to be designed for before Tier 3 ships, and it's worth
keeping them visible in the meantime:

- **Prompt injection via player input.** Once a Tier 3 NPC can call real game
  verbs as tools, player-supplied text is untrusted input reaching an agent
  with write access to game state. A player could try to talk an NPC into
  giving away items, revealing hidden quest state, or taking actions outside
  its intended role purely through phrasing. Treat NPC dialogue the same way
  you'd treat any tool-calling agent exposed to user input — don't let raw
  player text influence a brain's tool permissions or bypass its trigger
  rules.
- **Scoped tool access per NPC/brain tier.** An AI-driven NPC should only be
  able to invoke the verbs appropriate to its role (a blacksmith shouldn't be
  able to teleport players or alter world state outside its shop), not the
  full command set. Permission scoping belongs in the switchboard/engine, not
  left to the AI to self-restrain.
- **No unmediated AI actions.** Actions an AI brain "decides" to take should
  pass through the same validation/permission layer as a player-issued
  command, not execute directly against world state. This also keeps
  behavior consistent between brain tiers.
- **Cost/latency blast radius.** Without the compile-down mechanism (or a
  cap), a popular NPC or a griefing player could trigger repeated expensive
  AI calls. Rate-limit escalations per NPC and per player, and make sure a
  failed/slow AI call has a safe, cheap fallback response rather than hanging
  the game loop.
- **Knowledge store integrity.** Because lower tiers read from the same
  knowledge store the AI writes to, a bad or manipulated AI response could
  "poison" future scripted behavior (e.g. writing a false fact that Tier 1
  then repeats indefinitely). Consider validating or sandboxing AI writes to
  the store rather than trusting them unchecked.
- **Data-driven content isn't automatically safe.** As theme packs become
  data/JSON driven, treat pack loading like loading semi-trusted content —
  especially once packs might be shared by other people building on this
  base, not just written by us.

## Phased roadmap

**Phase 1 — Engine hardening (no new features, same game)**
Refactor entities to component bags, commands to a registry, add the event
bus, move room/item data to data files. Goal: current game behaves
identically but is now pluggable.

**Phase 2 — Core mechanics completeness**
Combat, stats, equipment/inventory slots, currency/economy,
multi-room/zone support, upgrade persistence past a single flat JSON file
(per-entity storage or a real embedded DB). This is the "complete vanilla
MUD base" other people build on.

**Phase 3 — Game clock + Tier 0/1 brains**
Scheduler, day/night or simple tick system, behavior-tag reflex NPCs, then
scripted job-loop NPCs with pathfinding fallbacks. Validates the engine can
drive NPC behavior without any AI yet.

**Phase 4 — Prove the separation**
Build the first real theme pack (fantasy) as the reference, then a *thin*
second pack (even minimal) purely to stress-test that verbs/components/data
loading actually stay separable. Fix leaks here, not after three themes
exist.

**Phase 5 — Knowledge store + Tier 2 dialogue + switchboard**
Build the plumbing (knowledge log, trigger rules, escalation dispatcher)
using only scripted tiers first — no LLM yet. This de-risks the hard part
(event routing, state consistency) before adding AI cost/latency into the
mix.

**Phase 6 — Tier 3 AI + compile-down**
LLM integration, tool-calling scoped to safe verbs, memory hand-off from the
knowledge store, and the "generate routine → demote to Tier 1" cost-saving
loop. Apply the guardrails above as this ships, not after.

**Phase 7 — Polish / open it up**
Admin/world-building tooling, docs for theme-pack authors, a second real
theme built by someone else as the actual validation of the whole premise.

Realistically, for solo/part-time work, Phases 1-4 are the bulk of the
calendar time and determine whether Phases 5-6 are pleasant or painful. Avoid
starting AI work before Phase 4 is solid — the brain-tier system is the more
exciting idea, but it's cheap insurance to build it on a proven engine rather
than a moving target.
