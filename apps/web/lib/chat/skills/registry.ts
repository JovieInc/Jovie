import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAppPath } from '@/lib/filesystem-paths';

/**
 * Jovie chat skills: markdown methods the model loads on demand.
 *
 * Thin harness, thick skills. Each skill is `library/<name>/SKILL.md` with
 * `name` and `description` frontmatter. Only the descriptions go into the
 * system prompt; the model calls `useSkill` to read a body when a request
 * fits. Adding a skill is adding a markdown file, with no tool or route edit.
 *
 * Loaded once at cold start, like knowledge topics, and traced into the
 * serverless bundle by `next.config.js`.
 */

export interface ChatSkill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  /** `plan: pro` in frontmatter: only paid plans can load the steps. */
  readonly paidOnly: boolean;
}

const SKILLS_DIR = resolveAppPath('lib', 'chat', 'skills', 'library');

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse a SKILL.md file, or null when its frontmatter is missing or bad. */
export function parseSkillFile(source: string): ChatSkill | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(
    source.replace(/\r\n/g, '\n')
  );
  if (!match) return null;
  const fields = new Map<string, string>();
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  const name = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';
  const body = match[2].trim();
  const plan = fields.get('plan');
  if (!NAME_PATTERN.test(name) || !description || !body) return null;
  if (plan !== undefined && plan !== 'pro') return null;
  return { name, description, body, paidOnly: plan === 'pro' };
}

function loadSkills(dir: string): readonly ChatSkill[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    console.error(
      `[skills] Failed to read skills from ${dir}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
  const skills: ChatSkill[] = [];
  for (const entry of entries.sort()) {
    try {
      const skill = parseSkillFile(
        readFileSync(join(dir, entry, 'SKILL.md'), 'utf-8')
      );
      if (skill && skill.name === entry) skills.push(skill);
      else console.error(`[skills] Skipped invalid skill "${entry}"`);
    } catch {
      // Not a skill folder.
    }
  }
  return skills;
}

/** Every chat skill, loaded at cold start. */
export const CHAT_SKILLS: readonly ChatSkill[] = loadSkills(SKILLS_DIR);

export function findChatSkill(
  name: string,
  skills: readonly ChatSkill[] = CHAT_SKILLS
): ChatSkill | null {
  const wanted = name.trim().toLowerCase();
  return skills.find(skill => skill.name === wanted) ?? null;
}

/**
 * Stable system prompt section: the skill index (the resolver) and the rule
 * for anything Jovie can't do yet.
 */
export function buildSkillsPromptSection(
  skills: readonly ChatSkill[] = CHAT_SKILLS
): string {
  const index =
    skills.length > 0
      ? `
## Skills
Each one is a step-by-step method for work artists ask for often. When a request fits one, call useSkill with its name first, then follow it.
${skills.map(skill => `- ${skill.name}${skill.paidOnly ? ' (Pro plan)' : ''}: ${skill.description}`).join('\n')}
`
      : '';
  return `${index}
## When You Can't Do Something Yet
If the artist asks for something no tool or skill covers, say plainly that you can't do it yet, then call requestCapability with what they asked for in their words. Never pretend a capability exists. If they teach you a repeatable way they want work done, use the capture-a-skill skill.
`;
}
