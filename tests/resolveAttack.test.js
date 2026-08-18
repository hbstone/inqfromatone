import assert from 'assert/strict';
import { resolveAttack } from '../modules/combat/resolveAttack.js';
import { registerCheckResolver } from '../modules/checks/registry.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat, getStatValue } from '../modules/stats.js';
import { on } from '../modules/events.js';

loadStatDefinitions(); // real content/stats/attributes.json - gives "vitality" -> "hp"

function makeCombatant(hp = 10) {
    const character = { name: 'Fighter', components: {} };
    initStat(character, 'hp', hp);
    return character;
}

const events = [];
on('attack', (payload) => events.push(['attack', payload]));
on('damage', (payload) => events.push(['damage', payload]));

// A hit: damage comes off the vitality-role stat (hp), both "attack" and
// "damage" events fire, and the raw statKey/context/damage the caller
// passed are exactly what reaches resolveCheck.
{
    events.length = 0;
    let receivedContext;
    registerCheckResolver(({ context }) => {
        receivedContext = context;
        return true;
    });

    const attacker = makeCombatant();
    const defender = makeCombatant();
    const attackParams = { statKey: 'strength', context: { difficulty: 5 }, damage: 3 };

    const result = resolveAttack(attacker, defender, attackParams);

    assert.deepStrictEqual(result, { hit: true, damage: 3 });
    assert.equal(getStatValue(defender, 'hp'), 7, 'defender\'s hp should drop by the damage amount');
    assert.deepStrictEqual(receivedContext, { difficulty: 5 }, 'the context passed in should reach resolveCheck unchanged');
    assert.deepStrictEqual(events, [
        ['attack', { attacker, defender, hit: true }],
        ['damage', { attacker, defender, amount: 3 }],
    ]);
}

// A miss: no damage applied, only "attack" fires (with hit: false) - no
// "damage" event at all.
{
    events.length = 0;
    registerCheckResolver(() => false);

    const attacker = makeCombatant();
    const defender = makeCombatant();

    const result = resolveAttack(attacker, defender, { statKey: 'strength', context: {}, damage: 3 });

    assert.deepStrictEqual(result, { hit: false });
    assert.equal(getStatValue(defender, 'hp'), 10, 'a miss should not change the defender\'s hp');
    assert.deepStrictEqual(events, [
        ['attack', { attacker, defender, hit: false }],
    ]);
}

console.log('All tests passed');
