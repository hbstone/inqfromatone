// Core's built-in verbs. This is effectively the "core pack" for now —
// content packs will register their own verbs the same way, by importing
// registerCommand from registry.js and calling it, without touching this
// file (see ARCHITECTURE.md).
//
// Registration order is deliberate, not alphabetical: it's the priority
// order for ambiguous abbreviations (see registry.js). Movement first, so
// n/s/e/w are directions (not say/emote/wear); then the most-used verbs, so
// `l`, `g`, `d`, `i` land where players expect.
import { registerCommand } from './registry.js';
import { color } from './color.js';
import { commands } from './commands.js';
import { drop } from './drop.js';
import { east } from './east.js';
import { emote } from './emote.js';
import { get } from './get.js';
import { give } from './give.js';
import { items } from './items.js';
import { look } from './look.js';
import { north } from './north.js';
import { put } from './put.js';
import { presence } from '../presence.js';
import { quit } from './quit.js';
import { remove } from './remove.js';
import { say } from './say.js';
import { score } from './score.js';
import { south } from './south.js';
import { tell } from './tell.js';
import { time } from './time.js';
import { wear, wield } from './wear.js';
import { west } from './west.js';
import { whisper } from './whisper.js';
import { who } from './who.js';

// Movement
registerCommand('north', north);
registerCommand('south', south);
registerCommand('east', east);
registerCommand('west', west);

// Looking and items
registerCommand('look', look);
registerCommand('get', get);
registerCommand('drop', drop);
registerCommand('give', give);
registerCommand('put', put);
registerCommand('items', items);
registerCommand('wear', wear);
registerCommand('wield', wield);
registerCommand('remove', remove);

// Communication
registerCommand('say', say);
registerCommand('tell', tell);
registerCommand('whisper', whisper);
registerCommand('emote', emote);
registerCommand('presence', presence); // p/pu stay put; pr is presence

// Combat verbs (kill, flee, disengage) live in packs/combat/.

// Character and settings
registerCommand('score', score);
registerCommand('color', color);
registerCommand('commands', commands); // after color, so c/co stay color; com is commands
registerCommand('who', who); // wh stays whisper (registered earlier); who is exact
registerCommand('time', time); // t stays tell; ti is time
registerCommand('quit', quit, { abbreviate: false }); // a stray `q` shouldn't log you out
