// Core's default check resolver. This is effectively the "core pack" for
// checks, the same framing already used for modules/commands/index.js:
// a real (if minimal) resolver so the registration mechanism is proven
// against something real, not left entirely theoretical. A theme pack can
// register its own resolver the same way, replacing this one.
//
// Deliberately deterministic - no dice/randomness. Nothing has asked for
// a specific dice mechanic yet, and inventing one here would be guessing;
// this only needs to prove the plumbing (register -> resolveCheck ->
// delegate with the right values).
import { registerCheckResolver } from "./registry.js";

registerCheckResolver(({ value, context }) => {
    const difficulty = context.difficulty ?? 0;
    return value >= difficulty;
});
