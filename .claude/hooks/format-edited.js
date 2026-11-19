// Claude Code hook (PostToolUse on Write|Edit, see .claude/settings.json):
// format the file Claude just wrote with the repo's Prettier setup, so
// edits never leave formatting for CI to catch.
//
// Reads the hook's JSON from stdin. Skips files outside the project (Claude
// also writes its own memory and scratch files), files Prettier ignores
// (.prettierignore, .gitignore) and files it has no parser for. Never
// fails the edit: any problem is reported on stderr and it exits 0.
import fs from 'fs';
import path from 'path';
import * as prettier from 'prettier';

async function main() {
    let input = '';
    for await (const chunk of process.stdin) {
        input += chunk;
    }
    const payload = JSON.parse(input);
    const file = payload.tool_response?.filePath ?? payload.tool_input?.file_path;
    if (!file) {
        return;
    }
    const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const relative = path.relative(project, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return; // outside the project
    }

    const ignorePath = ['.gitignore', '.prettierignore'].map((name) => path.join(project, name));
    const info = await prettier.getFileInfo(file, { ignorePath });
    if (info.ignored || !info.inferredParser) {
        return;
    }
    const options = await prettier.resolveConfig(file);
    const source = fs.readFileSync(file, 'utf8');
    const formatted = await prettier.format(source, { ...options, filepath: file });
    if (formatted !== source) {
        fs.writeFileSync(file, formatted);
    }
}

main().catch((err) => {
    console.error(`format-edited hook: ${err.message}`);
});
