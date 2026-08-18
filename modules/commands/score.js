import { getStatDefinitions } from "../content/loadStatDefinitions.js";
import { getStatValue } from "../stats.js";

export const score = (world, args, character) => {
    const lines = getStatDefinitions().map(def => {
        const value = getStatValue(character, def.key);
        return `${def.label}: ${value}`;
    });

    return lines.join("\n");
};
