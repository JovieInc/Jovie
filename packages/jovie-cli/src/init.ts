import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { SKILL_MD } from './skill.js';

/** Agent homes whose `skills/` dir loads SKILL.md folders. */
export const SKILL_TARGETS = [
  { agent: 'claude', home: '.claude' },
  { agent: 'codex', home: '.codex' },
  { agent: 'openclaw', home: '.openclaw' },
  { agent: 'hermes', home: '.hermes' },
] as const;

export interface InitResult {
  readonly installed: readonly string[];
  readonly skipped: readonly string[];
}

/** `--dir=~/x` reaches us unexpanded because the shell only expands bare `~`. */
export function resolveSkillsDir(dir: string, homeDir: string): string {
  const expanded = /^~(?=$|[\\/])/.test(dir)
    ? join(homeDir, dir.slice(1))
    : dir;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

const WRITE_FAILURES: Readonly<Record<string, string>> = {
  EACCES: 'permission denied',
  EPERM: 'permission denied',
  EROFS: 'read-only file system',
  ENOSPC: 'disk full',
  ENOTDIR: 'a path component is a file',
  EEXIST: 'a path component is a file',
};

/**
 * Replace the file atomically: a temp file in the same directory is renamed
 * over the target, so Ctrl-C or a concurrent `jovie init` never leaves a
 * truncated SKILL.md behind.
 */
function writeSkill(skillsDir: string): string {
  const target = join(skillsDir, 'jovie');
  const file = join(target, 'SKILL.md');
  const temp = join(target, `.SKILL.md.${process.pid}.${randomUUID()}.tmp`);
  try {
    mkdirSync(target, { recursive: true });
    writeFileSync(temp, SKILL_MD);
    renameSync(temp, file);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
      // The temp path is unreachable for the same reason the write failed.
    }
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const reason = WRITE_FAILURES[code];
    if (!reason) throw error;
    throw new Error(
      `Cannot write ${file}: ${reason}. Pass --dir with a writable skills directory.`,
      { cause: error }
    );
  }
  return file;
}

/**
 * Write `jovie/SKILL.md` into every installed agent's skills dir, or only into
 * `dir` when given. Agents that aren't installed are skipped, never created.
 */
export function installSkill(homeDir: string, dir?: string): InitResult {
  if (dir) {
    return {
      installed: [writeSkill(resolveSkillsDir(dir, homeDir))],
      skipped: [],
    };
  }

  const installed: string[] = [];
  const skipped: string[] = [];
  for (const { agent, home } of SKILL_TARGETS) {
    const agentHome = join(homeDir, home);
    if (existsSync(agentHome))
      installed.push(writeSkill(join(agentHome, 'skills')));
    else skipped.push(agent);
  }
  return { installed, skipped };
}
