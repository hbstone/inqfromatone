// `time` - the current in-game time of day (see modules/gameClock.js).
// Deliberately plain: clock and phase only. The day count is left out on
// purpose - a bare "day 1264" reads oddly, and dates belong to a theme's
// calendar (built from getGameTime().day). A theme that wants "the third
// bell past noon" or a calendar will need to replace this; the registry
// doesn't allow overriding a core verb yet (that's pack-composition work,
// Phase 4).
import { getGameTime } from '../gameClock.js';

/**
 * A 24-hour time as a 12-hour clock, e.g. 0:05 -> "12:05am", 17:26 -> "5:26pm".
 * @param {number} hour - 0 to 23.
 * @param {number} minute - 0 to 59.
 */
export function formatClock(hour, minute) {
    const suffix = hour < 12 ? 'am' : 'pm';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
}

export const time = () => {
    const { hour, minute, phase } = getGameTime();
    const clock = formatClock(hour, minute);
    return phase ? `It is ${clock} (${phase}).` : `It is ${clock}.`;
};
