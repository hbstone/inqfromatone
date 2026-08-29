import { resolveItemToken } from "../itemSearch.js";
import { canEquip } from "../equipment.js";

// `wear <item>` / `wield <item>` - same generic mechanism underneath (see
// ARCHITECTURE.md's Equipment section); registered as two verbs purely
// because which word reads naturally depends on the item ("wear a cap",
// "wield a sword"), not because they behave any differently. Only
// searches the character's own inventory - equipping something across
// the room isn't a thing. Doesn't support the 2.x/N*x qualifiers'
// cardinal form: equipping more than one item in the same command has no
// sensible single-slot outcome, so it's rejected instead of silently
// picking one.
function makeEquipCommand(verb) {
    return (world, args, character) => {
        const itemToken = args.join(" ");
        if (!itemToken) {
            return `What do you want to ${verb}?`;
        }

        const { matches, error } = resolveItemToken(itemToken, [character.inventory]);
        if (error) {
            return error;
        }
        if (matches.length === 0) {
            return "You aren't carrying that.";
        }
        if (matches.length > 1) {
            return `You can only ${verb} one thing at a time.`;
        }

        const { item, source } = matches[0];
        const result = canEquip(character, item);
        if (!result.ok) {
            return result.reason;
        }

        source.splice(source.indexOf(item), 1);
        character.equipment[item.equip.slot] = item;

        return `You ${verb} ${item.name}.`;
    };
}

export const wear = makeEquipCommand("wear");
export const wield = makeEquipCommand("wield");
