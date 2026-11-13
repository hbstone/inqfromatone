// `who` - everyone currently connected, alphabetical (case-insensitive),
// one per line.
export const who = (world) => {
    const names = world
        .getOnlineCharacters()
        .map((character) => character.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return ['Currently connected players:', ...names.map((name) => `  ${name}`)].join('\n');
};
