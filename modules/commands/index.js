// Core's built-in verbs. This is effectively the "core pack" for now —
// content packs will register their own verbs the same way, by importing
// registerCommand from registry.js and calling it, without touching this
// file (see ARCHITECTURE.md).
import { registerCommand } from "./registry.js";
import { drop } from "./drop.js";
import { east } from "./east.js";
import { get } from "./get.js";
import { give } from "./give.js";
import { look } from "./look.js";
import { north } from "./north.js";
import { quit } from "./quit.js";
import { south } from "./south.js";
import { tell } from "./tell.js";
import { west } from "./west.js";
import { whisper } from "./whisper.js";

registerCommand("drop", drop);
registerCommand("east", east);
registerCommand("get", get);
registerCommand("give", give);
registerCommand("look", look);
registerCommand("north", north);
registerCommand("quit", quit);
registerCommand("south", south);
registerCommand("tell", tell);
registerCommand("west", west);
registerCommand("whisper", whisper);
