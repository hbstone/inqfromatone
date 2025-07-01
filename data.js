import fs from 'fs';

const DATA_FILE = new URL('./characters.json', import.meta.url);

export function loadCharacters() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function saveCharacters(chars) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(chars, null, 2));
}
