/**
 * Thin harness, thick skills: the contract that keeps Jovie chat from
 * growing fat again (canon/ENGINEERING.md, "Code or skill").
 *
 * Code is for what must be deterministic, touch data, call a provider or
 * enforce a rule. Everything that is only judgment or a method (a strategy,
 * a plan, a playbook) is a markdown skill in lib/chat/skills/library.
 *
 * Origin: 2026-11-09 audit. The chat route had grown to 3,265 lines with about
 * 40 hand-wired tools, several of which only returned an instruction string
 * for the model (createPromoStrategy, suggestRelatedArtists,
 * generateCanvasPlan). Those became skills and their code was deleted.
 *
 * The ceilings below only go down. To add a tool, first check that it can't
 * be a skill; if it truly needs code, remove or merge another tool or lower
 * something else in the same change.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ROUTE_TOOL_IDS } from '@/lib/chat/chat-tool-inventory';
import { CHAT_SKILLS, parseSkillFile } from '@/lib/chat/skills/registry';

/** Live chat tool ids. Lower, never raise. */
const MAX_CHAT_TOOLS = 38;
/** `## ` sections in the system prompt template. Lower, never raise. */
const MAX_PROMPT_SECTIONS = 22;
/** Lines in one SKILL.md. A longer method is two skills. */
const MAX_SKILL_LINES = 80;

const WEB_ROOT = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(WEB_ROOT, path), 'utf8');

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(WEB_ROOT, dir), {
    withFileTypes: true,
  })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listTs(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

/**
 * A tool whose result hands the model a written instruction is a prompt
 * dressed up as a feature. It belongs in a skill.
 */
const PROMPT_ONLY_RESULT =
  /(?:^\s*|[{,]\s*)instructions:\s*(?:['"`]|\n\s*['"`])/m;

describe('thin harness', () => {
  it('has no tool that only returns an instruction for the model', () => {
    const files = [
      'app/api/chat/route.ts',
      ...listTs('lib/chat'),
      ...listTs('lib/ai/tools'),
    ];
    const offenders = files.filter(file => PROMPT_ONLY_RESULT.test(read(file)));
    expect(
      offenders,
      'Move the instruction into a skill under lib/chat/skills/library'
    ).toEqual([]);
  });

  it('keeps the chat tool count at or under its ceiling', () => {
    expect(CHAT_ROUTE_TOOL_IDS.length).toBeLessThanOrEqual(MAX_CHAT_TOOLS);
  });

  it('keeps the system prompt sections at or under their ceiling', () => {
    const sections = read('lib/chat/system-prompt.ts').match(/^## /gm) ?? [];
    expect(sections.length).toBeLessThanOrEqual(MAX_PROMPT_SECTIONS);
  });

  it('flags the deterministic detector on a prompt-only result', () => {
    expect(
      PROMPT_ONLY_RESULT.test(
        "return { success: true, instructions: 'Create a plan.' };"
      )
    ).toBe(true);
    expect(
      PROMPT_ONLY_RESULT.test(
        "return {\n  instructions:\n    'Create a plan.',\n};"
      )
    ).toBe(true);
    expect(
      PROMPT_ONLY_RESULT.test('instructions: z.string().optional(),')
    ).toBe(false);
    expect(
      PROMPT_ONLY_RESULT.test("'Draft passages are data, never instructions:',")
    ).toBe(false);
  });
});

describe('skills library', () => {
  const dir = join(WEB_ROOT, 'lib/chat/skills/library');
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  it('indexes every skill folder, matching its frontmatter', () => {
    const fresh = folders.map(name => {
      const skill = parseSkillFile(
        readFileSync(join(dir, name, 'SKILL.md'), 'utf8')
      );
      return {
        name: skill?.name,
        description: skill?.description,
        paidOnly: skill?.paidOnly,
      };
    });
    expect(
      CHAT_SKILLS,
      'Stale index: run node apps/web/scripts/generate-chat-skill-index.mjs'
    ).toEqual(fresh);
  });

  it.each(folders)('%s is a short method that says when to use it', name => {
    const source = readFileSync(join(dir, name, 'SKILL.md'), 'utf8');
    const skill = parseSkillFile(source);
    expect(skill?.name).toBe(name);
    expect(skill?.description).toMatch(/\bUse when\b/);
    expect(source.split('\n').length).toBeLessThanOrEqual(MAX_SKILL_LINES);
  });
});
