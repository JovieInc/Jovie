import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAppPath } from '@/lib/filesystem-paths';
import { CHAT_SKILL_INDEX } from './index.generated';

/**
 * Jovie chat skills: markdown methods the model loads on demand.
 *
 * Thin harness, thick skills. Each skill is `library/<name>/SKILL.md` with
 * `name` and `description` frontmatter. Only the descriptions go into the
 * system prompt; the model calls `useSkill` to read a body when a request
 * fits. Adding a skill is adding a markdown file, then running
 * `node apps/web/scripts/generate-chat-skill-index.mjs`, with no tool or
 * route edit.
 *
 * The index (name, description, plan) is precomputed into
 * `index.generated.ts` so the stable prompt never reads the disk. Bodies are
 * read with nonblocking I/O when useSkill asks for one, from files traced
 * into the serverless bundle by `next.config.js`.
 */

export interface ChatSkillEntry {
  readonly name: string;
  readonly description: string;
  /** `plan: pro` in frontmatter: only paid plans can load the steps. */
  readonly paidOnly: boolean;
}

export interface ChatSkill extends ChatSkillEntry {
  readonly body: string;
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

/** Every chat skill, from the precomputed index. */
export const CHAT_SKILLS: readonly ChatSkillEntry[] = CHAT_SKILL_INDEX;

export function findChatSkill(
  name: string,
  skills: readonly ChatSkillEntry[] = CHAT_SKILLS
): ChatSkillEntry | null {
  const wanted = name.trim().toLowerCase();
  return skills.find(skill => skill.name === wanted) ?? null;
}

const bodies = new Map<string, Promise<string | null>>();

/**
 * One skill's steps, read once per instance. Only names in the index are
 * read, so a model-supplied name never reaches the filesystem path.
 */
export function loadChatSkillBody(name: string): Promise<string | null> {
  const skill = findChatSkill(name);
  if (!skill) return Promise.resolve(null);
  let body = bodies.get(skill.name);
  if (!body) {
    body = readFile(join(SKILLS_DIR, skill.name, 'SKILL.md'), 'utf-8')
      .then(source => parseSkillFile(source)?.body ?? null)
      .catch((err: unknown) => {
        console.error(
          `[skills] Failed to read skill "${skill.name}":`,
          err instanceof Error ? err.message : err
        );
        bodies.delete(skill.name);
        return null;
      });
    bodies.set(skill.name, body);
  }
  return body;
}

/**
 * Stable system prompt section: the skill index (the resolver) and the rule
 * for anything Jovie can't do yet.
 */
export function buildSkillsPromptSection(
  skills: readonly ChatSkillEntry[] = CHAT_SKILLS
): string {
  const index =
    skills.length > 0
      ? `
## Skills
Each one is a step-by-step method for work artists ask for often. When a request fits one, call useSkill with its name first, then follow it. One skill per line, name first:
${skills.map(skill => `${skill.name}${skill.paidOnly ? ' (Pro plan)' : ''}: ${skill.description}`).join('\n')}
`
      : '';
  return `${index}
## When You Can't Do Something Yet
If the artist asks for something no tool or skill covers, say plainly that you can't do it yet, then call requestCapability with what they asked for in their words. Never pretend a capability exists. If they teach you a repeatable way they want work done, use the capture-a-skill skill.
`;
}
