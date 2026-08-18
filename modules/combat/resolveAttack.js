// Core combat resolution (see ARCHITECTURE.md's Combat section). Takes a
// fully-formed attack - which stat to check, what context to hand the
// check resolver, how much damage a hit does - and doesn't know or care
// where any of that came from (an auto-attack producer today, parsed
// cemote text later). The one thing it's allowed to know, same as the
// rest of core, is that "vitality" is the role damage comes off of.
import { resolveCheck } from "../checks/registry.js";
import { getStatKeyForRole } from "../content/loadStatDefinitions.js";
import { adjustBaseStat } from "../stats.js";
import { emit } from "../events.js";

/**
 * Resolve a single attack: attacker vs. defender.
 * @param {object} attacker
 * @param {object} defender
 * @param {{ statKey: string, context?: object, damage: number }} attackParams
 * @returns {{ hit: boolean, damage?: number }}
 */
export function resolveAttack(attacker, defender, attackParams) {
    const { statKey, context, damage } = attackParams;
    const hit = resolveCheck(attacker, statKey, context);
    emit("attack", { attacker, defender, hit });

    if (!hit) {
        return { hit: false };
    }

    adjustBaseStat(defender, getStatKeyForRole("vitality"), -damage);
    emit("damage", { attacker, defender, amount: damage });

    return { hit: true, damage };
}
