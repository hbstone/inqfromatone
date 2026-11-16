// Who's sneaking, and how the people around them take it.
//
// A player sneaks while their `sneak` toggle is on. It's kept in
// components.stealth, so it survives a disconnect: someone who drops
// mid-scene comes back still sneaking (and their prompt says so).
//
// An NPC sneaks from content, either always or some of the time:
//
//   "components": { "stealth": { "sneaking": true } }      // a thief
//   "components": { "stealth": { "sneakChance": 0.3 } }    // the cat
//
// The odds, per observer who can see (core has already left out anyone who
// can't): UNNOTICED of the time they miss it, SUSPICIOUS they catch the
// sneaker at it, and otherwise they see it as usual. A game wanting
// dexterity, gear or skill in the mix registers its own rule instead (with
// { override: true }), and can reuse isSneaking.

export const UNNOTICED = 0.5;
export const SUSPICIOUS = 0.25;

/** Whether a player has their sneak toggle on. */
export function hasSneakOn(character) {
    return character.components?.stealth?.sneaking === true;
}

/** Turn a player's sneak toggle on or off. */
export function setSneak(character, on) {
    if (on) {
        character.components.stealth = { ...character.components.stealth, sneaking: true };
    } else if (character.components.stealth) {
        delete character.components.stealth.sneaking;
        if (Object.keys(character.components.stealth).length === 0) {
            delete character.components.stealth;
        }
    }
}

/**
 * Whether someone is sneaking this time: their toggle (or an NPC's
 * content says always), or an NPC's sneakChance coming up.
 * @param {object} character
 * @param {() => number} random
 */
export function isSneaking(character, random) {
    if (hasSneakOn(character)) {
        return true;
    }
    const chance = character.components?.stealth?.sneakChance;
    return typeof chance === 'number' && random() < chance;
}

/**
 * The notice rule (see modules/notice.js): one roll for whether the actor
 * is sneaking at all, then one per observer.
 * @param {() => number} [random] - Overridable for tests.
 */
export function makeNoticeRule(random = Math.random) {
    return ({ actor, observers }) => {
        if (!isSneaking(actor, random)) {
            return null;
        }
        return new Map(
            observers.map((observer) => {
                const roll = random();
                if (roll < UNNOTICED) {
                    return [observer, 'unnoticed'];
                }
                return [observer, roll < UNNOTICED + SUSPICIOUS ? 'suspicious' : 'noticed'];
            }),
        );
    };
}
