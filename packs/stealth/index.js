// The stealth pack: sneaking (see ARCHITECTURE.md's "Noticing" and
// "Stealth"). Core asks a notice rule who saw what (modules/notice.js);
// this pack supplies one, plus the `sneak` toggle and a prompt status.
// Leave it out and everyone notices everything, as before.
//
// lib/sneaking.js has the odds and who counts as sneaking.
import { hasSneakOn, makeNoticeRule, setSneak } from './lib/sneaking.js';

// `sneak` toggles; `sneak on` / `sneak off` say which. It stays on until
// you turn it off, through moves, talk and logins.
export const sneak = (world, args, character) => {
    const wanted = args[0]?.toLowerCase();
    if (wanted && wanted !== 'on' && wanted !== 'off') {
        return 'Usage: sneak, or sneak on / sneak off';
    }
    const on = wanted ? wanted === 'on' : !hasSneakOn(character);
    if (on === hasSneakOn(character)) {
        return on ? "You're already sneaking." : "You aren't sneaking.";
    }
    setSneak(character, on);
    return on
        ? 'You start moving quietly, trying not to draw notice.'
        : 'You stop sneaking and move about openly again.';
};

export default function setup(pack) {
    pack.registerCommand('sneak', sneak);
    pack.registerNoticeRule(makeNoticeRule());
    pack.registerPromptStatus((character) => (hasSneakOn(character) ? 'sneaking' : null));
}
