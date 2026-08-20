// Core's built-in verbs. This is effectively the "core pack" for now —
// content packs will register their own verbs the same way, by importing
// registerCommand from registry.js and calling it, without touching this
// file (see ARCHITECTURE.md).
import { registerCommand } from "./registry.js";
import { disengage } from "./disengage.js";
import { drop } from "./drop.js";
import { east } from "./east.js";
import { emote } from "./emote.js";
import { flee } from "./flee.js";
import { get } from "./get.js";
import { give } from "./give.js";
import { items } from "./items.js";
import { kill } from "./kill.js";
import { look } from "./look.js";
import { north } from "./north.js";
import { put } from "./put.js";
import { quit } from "./quit.js";
import { say } from "./say.js";
import { score } from "./score.js";
import { south } from "./south.js";
import { tell } from "./tell.js";
import { west } from "./west.js";
import { whisper } from "./whisper.js";

registerCommand("disengage", disengage);
registerCommand("drop", drop);
registerCommand("east", east);
registerCommand("emote", emote);
registerCommand("flee", flee);
registerCommand("get", get);
registerCommand("give", give);
registerCommand("items", items);
registerCommand("kill", kill);
registerCommand("look", look);
registerCommand("north", north);
registerCommand("put", put);
registerCommand("quit", quit);
registerCommand("say", say);
registerCommand("score", score);
registerCommand("south", south);
registerCommand("tell", tell);
registerCommand("west", west);
registerCommand("whisper", whisper);
