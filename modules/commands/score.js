import { getStatDefinitions } from "../content/loadStatDefinitions.js";
import { getStatValue } from "../stats.js";

export const score = (world, args, character) => {
    const lines = getStatDefinitions().map(def => {
        const value = getStatValue(character, def.key);
        return `${def.label}: ${value}`;
    });

    const equipped = Object.entries(character.equipment);
    const equipmentLines = equipped.length > 0
        ? equipped.map(([slot, item]) => `  ${slot}: ${item.name}`).join("\n")
        : "  Nothing";

    return `${lines.join("\n")}\n\nEquipped:\n${equipmentLines}`;
};
