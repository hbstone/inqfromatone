// `aiusage`: how much the AI tier has been used today and this month, with
// a rough cost (see modules/npcs/aiUsage.js). For staff; there are no roles
// yet, so for now everyone who connects can run it.
import { logsDir } from '../saveDirs.js';
import { aiLogFile, readAiLog, usageReport } from '../npcs/aiUsage.js';
import { aiTierStatus } from '../npcs/claudeTier.js';

export const aiusage = () =>
    usageReport({
        entries: readAiLog(aiLogFile(logsDir())),
        status: aiTierStatus(),
        budget: Number(process.env.MUD_AI_MONTHLY_BUDGET) || null,
    });
