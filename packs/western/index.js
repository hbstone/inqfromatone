// The western pack (see ARCHITECTURE.md's "Packs"): Dry Creek, a small
// frontier town, as a second theme on the same engine. It doesn't build on
// the starter pack at all - its own zone, items, NPCs, stats, day and
// recognition switch are in content/ - so a game can run it alone, or put
// combat after it (its strength and dexterity are what combat gives roles).
//
// Code adds one verb, `tip`, the kind of small theme-flavored social verb
// a pack is meant to bring.
import { tip } from './lib/tip.js';

export default function setup(pack) {
    pack.registerCommand('tip', tip);
}
