import fs from 'fs';
const path = './data/characters.json';

function loadCharacters() {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(path));
}

function saveCharacters(characters) {
    fs.writeFileSync(path, JSON.stringify(characters, null, 2));
}

export default { loadCharacters, saveCharacters };
