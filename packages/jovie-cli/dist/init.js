import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_MD } from './skill.js';
/** Agent homes whose `skills/` dir loads SKILL.md folders. */
export const SKILL_TARGETS = [
    { agent: 'claude', home: '.claude' },
    { agent: 'codex', home: '.codex' },
    { agent: 'openclaw', home: '.openclaw' },
    { agent: 'hermes', home: '.hermes' },
];
/**
 * Write `jovie/SKILL.md` into every installed agent's skills dir, or only into
 * `dir` when given. Agents that aren't installed are skipped, never created.
 */
export function installSkill(homeDir, dir) {
    const write = (skillsDir) => {
        const target = join(skillsDir, 'jovie');
        mkdirSync(target, { recursive: true });
        const file = join(target, 'SKILL.md');
        writeFileSync(file, SKILL_MD);
        return file;
    };
    if (dir)
        return { installed: [write(dir)], skipped: [] };
    const installed = [];
    const skipped = [];
    for (const { agent, home } of SKILL_TARGETS) {
        const agentHome = join(homeDir, home);
        if (existsSync(agentHome))
            installed.push(write(join(agentHome, 'skills')));
        else
            skipped.push(agent);
    }
    return { installed, skipped };
}
//# sourceMappingURL=init.js.map