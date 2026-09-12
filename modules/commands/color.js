// Toggles a character's color preference (see modules/color.js for the
// token syntax and modules/utils.js's writeToSocket for where the
// preference is actually applied - this command just flips the flag).
export const color = (world, args, character) => {
    const arg = args[0]?.toLowerCase();

    if (!arg) {
        return `Color is currently ${character.colorEnabled ? "on" : "off"}.`;
    }
    if (arg === "on") {
        character.colorEnabled = true;
        return "Color is now on.";
    }
    if (arg === "off") {
        character.colorEnabled = false;
        return "Color is now off.";
    }

    return "Usage: color [on|off]";
};
