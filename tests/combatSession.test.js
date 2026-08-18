import assert from 'assert/strict';
import { mock } from 'node:test';
import { engageCombat, disengageCombat, getSession } from '../modules/combat/session.js';
import { registerAttackProducer } from '../modules/combat/registry.js';
import { registerCheckResolver } from '../modules/checks/registry.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat, getStatValue } from '../modules/stats.js';

loadStatDefinitions(); // real content/stats/attributes.json - gives "vitality" -> "hp"

function makeCombatant(name, hp = 10) {
    const character = { name, components: {} };
    initStat(character, 'hp', hp);
    return character;
}

// Deterministic for the whole file: every attack hits for 1 damage - this
// file is testing session/timer bookkeeping, not the hit-chance jitter
// (see defaultCheckResolver.test.js) or attack resolution (see
// resolveAttack.test.js).
registerCheckResolver(() => true);
registerAttackProducer(() => ({ statKey: 'strength', context: {}, damage: 1 }));

// engageCombat starts a shared session for both sides
{
    const a = makeCombatant('A');
    const b = makeCombatant('B');
    assert.equal(engageCombat(a, b), true);
    assert.ok(getSession(a));
    assert.equal(getSession(a), getSession(b), 'both sides should share the same session');
    disengageCombat(a);
    disengageCombat(b);
}

// Can't attack yourself
{
    const a = makeCombatant('A');
    assert.equal(engageCombat(a, a), false);
    assert.equal(getSession(a), undefined);
}

// Can't attack an already-defeated target
{
    const a = makeCombatant('A');
    const b = makeCombatant('B', 0);
    assert.equal(engageCombat(a, b), false);
    assert.equal(getSession(a), undefined);
}

// A third party joining an existing fight shares the same session
{
    const a = makeCombatant('A');
    const b = makeCombatant('B');
    const c = makeCombatant('C');
    engageCombat(a, b);
    engageCombat(c, b);

    assert.equal(getSession(a), getSession(c));
    assert.equal(getSession(a).participants.size, 3);

    disengageCombat(a);
    disengageCombat(b);
    disengageCombat(c);
}

// Attacking someone new pulls you out of whatever fight you were already
// in - "one fight at a time" for now (see ARCHITECTURE.md's m:n note)
{
    const a = makeCombatant('A');
    const b = makeCombatant('B');
    const c = makeCombatant('C');
    engageCombat(a, b);
    const oldSession = getSession(b);
    engageCombat(a, c);

    assert.equal(getSession(a), getSession(c));
    assert.notEqual(getSession(a), oldSession);
    assert.equal(getSession(b), undefined, 'b should no longer be in a session - a was their only opponent');

    disengageCombat(a);
    disengageCombat(c);
}

// disengageCombat removes just the caller; combat ends for whoever's left
// once fewer than two combatants remain
{
    const a = makeCombatant('A');
    const b = makeCombatant('B');
    engageCombat(a, b);

    assert.equal(disengageCombat(a), true);
    assert.equal(getSession(a), undefined);
    assert.equal(getSession(b), undefined, 'with only b left, combat should end for b too');
}

// disengageCombat on someone not in combat is a no-op, not an error
{
    const a = makeCombatant('A');
    assert.equal(disengageCombat(a), false);
}

// Auto-attack: each side's timer independently lands a hit every 2s tick
{
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });

    const a = makeCombatant('A');
    const b = makeCombatant('B');
    engageCombat(a, b);

    mock.timers.tick(2000);
    assert.equal(getStatValue(a, 'hp'), 9, 'b\'s tick should have hit a');
    assert.equal(getStatValue(b, 'hp'), 9, 'a\'s tick should have hit b');

    mock.timers.tick(2000);
    assert.equal(getStatValue(a, 'hp'), 8);
    assert.equal(getStatValue(b, 'hp'), 8);

    disengageCombat(a);
    disengageCombat(b);
    mock.timers.reset();
}

// Combat ends automatically once a combatant's hp reaches 0
{
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });

    const a = makeCombatant('A', 100); // will survive
    const b = makeCombatant('B', 1);   // one hit from defeat
    engageCombat(a, b);

    mock.timers.tick(2000);

    assert.equal(getStatValue(b, 'hp'), 0);
    assert.equal(getSession(a), undefined, 'combat should end for the survivor too');
    assert.equal(getSession(b), undefined);

    mock.timers.reset();
}

console.log('All tests passed');
