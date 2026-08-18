// Core's default check resolver. This is effectively the "core pack" for
// checks, the same framing already used for modules/commands/index.js:
// a real (if minimal) resolver so the registration mechanism is proven
// against something real, not left entirely theoretical. A theme pack can
// register its own resolver the same way, replacing this one.
//
// A small amount of randomness, added for combat (see ARCHITECTURE.md):
// a uniform -1/0/+1 nudge to the attacker's effective value, meet-or-beat
// to succeed. With equal stats that's a 2/3 chance of success - enough
// that a fixed matchup doesn't always land or always whiff, without
// inventing a real dice mechanic nobody's asked for yet.
import { registerCheckResolver } from "./registry.js";

function rollJitter() {
    return Math.floor(Math.random() * 3) - 1; // -1, 0, or +1, uniform
}

registerCheckResolver(({ value, context }) => {
    const difficulty = context.difficulty ?? 0;
    return value + rollJitter() >= difficulty;
});
