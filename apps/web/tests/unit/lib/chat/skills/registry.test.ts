import { describe, expect, it } from 'vitest';
import {
  buildSkillsPromptSection,
  CHAT_SKILLS,
  findChatSkill,
  parseSkillFile,
} from '@/lib/chat/skills/registry';
import { createUseSkillTool } from '@/lib/chat/skills/tools';

describe('chat skills library', () => {
  it('loads every SKILL.md in the library', () => {
    expect(CHAT_SKILLS.map(skill => skill.name)).toEqual([
      'capture-a-skill',
      'release-launch',
      'weekly-marketing-plan',
    ]);
    for (const skill of CHAT_SKILLS) {
      expect(skill.description.length).toBeGreaterThan(40);
      expect(skill.body).toContain('## Never');
    }
  });

  it('keeps drafts as drafts: no skill tells Jovie to post or send', () => {
    for (const skill of CHAT_SKILLS) {
      expect(skill.body).toMatch(/Never (post|put)/);
    }
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
    });
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
    expect(section).toContain('- weekly-marketing-plan: ');
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
    const run = useSkill.execute as (
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
});
