import { describe, expect, it } from 'vitest';
import {
  buildSkillsPromptSection,
  CHAT_SKILLS,
  findChatSkill,
  loadChatSkillBody,
  parseSkillFile,
} from '@/lib/chat/skills/registry';
import { createUseSkillTool } from '@/lib/chat/skills/tools';

describe('chat skills library', () => {
  it('loads every SKILL.md in the library', () => {
    expect(CHAT_SKILLS.map(skill => skill.name)).toEqual([
      'canvas-plan',
      'capture-a-skill',
      'promo-strategy',
      'related-artists',
      'release-launch',
      'weekly-marketing-plan',
    ]);
    for (const skill of CHAT_SKILLS) {
      expect(skill.description.length).toBeGreaterThan(40);
    }
  });

  it('keeps drafts as drafts: no skill tells Jovie to post or send', async () => {
    for (const skill of CHAT_SKILLS) {
      const body = await loadChatSkillBody(skill.name);
      expect(body).toContain('## Never');
      expect(body).toMatch(/Never (post|put)/);
    }
  });

  it('reads no body for a name outside the index', async () => {
    expect(await loadChatSkillBody('../../secrets')).toBeNull();
  });
});

describe('parseSkillFile', () => {
  it('reads name, description and body', () => {
    expect(
      parseSkillFile(
        '---\nname: fan-thanks\ndescription: Thank fans after a show.\n---\n# Fan thanks\nSteps.'
      )
    ).toEqual({
      name: 'fan-thanks',
      description: 'Thank fans after a show.',
      body: '# Fan thanks\nSteps.',
      paidOnly: false,
    });
  });

  it('marks plan: pro skills as paid only and rejects other plans', () => {
    expect(
      parseSkillFile(
        '---\nname: ad-plan\ndescription: Plan ads.\nplan: pro\n---\nSteps.'
      )?.paidOnly
    ).toBe(true);
    expect(
      parseSkillFile(
        '---\nname: ad-plan\ndescription: Plan ads.\nplan: gold\n---\nSteps.'
      )
    ).toBeNull();
  });

  it('rejects a file without frontmatter, a bad name or an empty body', () => {
    expect(parseSkillFile('# No frontmatter')).toBeNull();
    expect(
      parseSkillFile('---\nname: Bad Name\ndescription: x\n---\nbody')
    ).toBeNull();
    expect(parseSkillFile('---\nname: ok\ndescription: x\n---\n')).toBeNull();
  });
});

describe('buildSkillsPromptSection', () => {
  it('lists each skill and the rule for missing capabilities', () => {
    const section = buildSkillsPromptSection();
    expect(section).toContain('## Skills');
    expect(section).toMatch(/^weekly-marketing-plan: /m);
    expect(section).toMatch(/^promo-strategy \(Pro plan\): /m);
    expect(section).toContain('requestCapability');
    expect(section).toContain('Never pretend a capability exists');
  });

  it('keeps the capability rule with no skills', () => {
    const section = buildSkillsPromptSection([]);
    expect(section).not.toContain('## Skills');
    expect(section).toContain('requestCapability');
  });
});

describe('useSkill tool', () => {
  it('returns the steps for a listed skill and the list for an unknown one', async () => {
    const useSkill = createUseSkillTool();
    const run = useSkill.execute as unknown as (
      input: { name: string },
      options: unknown
    ) => Promise<Record<string, unknown>>;
    const found = await run({ name: 'Release-Launch' }, {});
    expect(found.success).toBe(true);
    expect(String(found.steps)).toContain('# Release launch');
    expect(findChatSkill('release-launch')?.name).toBe('release-launch');

    const missing = await run({ name: 'nope' }, {});
    expect(missing.success).toBe(false);
    expect(missing.available).toContain('weekly-marketing-plan');
  });

  it('locks a Pro skill on a free plan and opens it on a paid one', async () => {
    const runFor = (paidPlan: boolean) =>
      createUseSkillTool({ paidPlan }).execute as unknown as (
        input: { name: string },
        options: unknown
      ) => Promise<Record<string, unknown>>;
    const free = await runFor(false)({ name: 'promo-strategy' }, {});
    expect(free).toMatchObject({ success: false, locked: true });
    expect(free.steps).toBeUndefined();
    const paid = await runFor(true)({ name: 'promo-strategy' }, {});
    expect(paid.success).toBe(true);
    expect(String(paid.steps)).toContain('# Promo strategy');
  });
});
