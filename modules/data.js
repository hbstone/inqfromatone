const fs = require('fs');
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

module.exports = { loadCharacters, saveCharacters };
