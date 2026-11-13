// What a pack's code gets to work with (see ARCHITECTURE.md's "Packs"):
// its index.js default export receives one of these.
//
//   export default function setup(pack) {
//       pack.registerCommand('tip', tipHat);
//       pack.registerCommand('time', westernTime, { override: true });
//       pack.on('phaseChange', ({ to }) => { ... });
//   }
//
// Going through this rather than importing engine registries directly keeps
// errors attributed to the pack that caused them, and gives the engine one
// place to change if registration rules grow. It isn't a sandbox: pack code
// is ordinary Node code and fully trusted. Only data-only packs are "safe".
import { registerCommand } from '../commands/registry.js';
import { registerBehavior } from '../npcs/behaviors.js';
import { on } from '../events.js';
import { every, after } from '../scheduler.js';

/**
 * @param {{ name: string, dir: string, manifest: object }} pack
 * @param {import("../World.js").World} world
 */
export function createPackContext(pack, world) {
    const attributed =
        (fn) =>
        (...args) => {
            try {
                return fn(...args);
            } catch (err) {
                err.message = `Pack "${pack.name}": ${err.message}`;
                throw err;
            }
        };

    return Object.freeze({
        name: pack.name,
        dir: pack.dir,
        manifest: pack.manifest,
        world,
        /** See modules/commands/registry.js; pass { override: true } to replace an existing verb. */
        registerCommand: attributed(registerCommand),
        /** See modules/npcs/behaviors.js; pass { override: true } to replace an existing behavior. */
        registerBehavior: attributed(registerBehavior),
        /** Listen for an engine event (see modules/events.js). */
        on: attributed(on),
        /** Recurring job on the engine scheduler; the label is prefixed with the pack name. */
        every: attributed((label, intervalMs, fn) => every(`${pack.name}: ${label}`, intervalMs, fn)),
        /** One-off job on the engine scheduler; the label is prefixed with the pack name. */
        after: attributed((label, delayMs, fn) => after(`${pack.name}: ${label}`, delayMs, fn)),
    });
}
