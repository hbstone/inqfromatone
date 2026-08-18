// Engine-side attack-producer registry (see ARCHITECTURE.md's Combat
// section). "How does a participant's action for an auto-attack get
// produced" is entirely theme-owned - an unarmed strike today, a wielded
// weapon or parsed cemote text later. Core only ever calls the one
// registered producer, the same single-slot shape as
// modules/checks/registry.js's resolver.
let producer = null;

/**
 * Register the function that produces an attack's params. Replaces any
 * previously registered producer.
 * @param {(attacker: object, defender: object) => { statKey: string, context?: object, damage: number }} fn
 */
export function registerAttackProducer(fn) {
    producer = fn;
}

/**
 * Ask the registered producer for the params of an attacker's attack
 * against a defender.
 * @param {object} attacker
 * @param {object} defender
 * @returns {{ statKey: string, context?: object, damage: number }}
 */
export function produceAttack(attacker, defender) {
    if (!producer) {
        throw new Error("No attack producer registered (see registerAttackProducer).");
    }
    return producer(attacker, defender);
}
