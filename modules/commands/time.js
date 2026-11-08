// `time` - the current in-game time of day (see modules/gameClock.js).
// Deliberately plain. A theme that wants "the third bell past noon" or a
// calendar will need to replace this; the registry doesn't allow
// overriding a core verb yet (that's pack-composition work, Phase 4).
import { getGameTime } from "../gameClock.js";

export const time = () => {
    const { day, hour, minute, phase } = getGameTime();
    const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return phase
        ? `It is ${clock} (${phase}) on day ${day}.`
        : `It is ${clock} on day ${day}.`;
};
