// Shared test fixtures. Look here before writing another fake socket.
import { Character } from '../modules/Character.js';

/**
 * A socket that records what's written to it (`messages`) and whether it
 * was closed (`ended`).
 */
export function fakeSocket() {
    const socket = { messages: [], ended: false };
    socket.write = (msg) => socket.messages.push(msg);
    socket.end = () => {
        socket.ended = true;
    };
    return socket;
}

/**
 * A connected Character with a fakeSocket.
 * @param {string} name
 * @param {object} [props] - Extra fields to set, e.g. { shortDesc }.
 */
export function makeCharacter(name, props = {}) {
    const character = new Character(name, `${name}, a tester.`);
    Object.assign(character, props);
    character.socket = fakeSocket();
    return character;
}

/**
 * The last message a character was sent, without writeToSocket's CRLF
 * framing, and with internal line breaks as plain \n.
 */
export function lastMessage(character) {
    const { messages } = character.socket;
    return messages[messages.length - 1].replace(/^\r\n/, '').replace(/\r\n$/, '').replace(/\r\n/g, '\n');
}
