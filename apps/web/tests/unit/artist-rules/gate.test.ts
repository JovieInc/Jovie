import { lintCopy } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_RULE_REPLY_FALLBACK,
  buildArtistRulesPromptSection,
  type EnforcedArtistRule,
  findArtistRuleViolations,
  MAX_PROMPT_ARTIST_RULES,
  peopleRuleNames,
} from '@/lib/artist-rules/gate';
import { gateAssistantReply } from '@/lib/chat/voice-lint';

function rule(overrides: Partial<EnforcedArtistRule>): EnforcedArtistRule {
  return {
    id: overrides.id ?? 'rule-1',
    category: overrides.category ?? 'people',
    ruleKey: overrides.ruleKey ?? 'Sam Rivera, Sammy',
    instruction: overrides.instruction ?? 'Keep them out of anything public.',
    strength: overrides.strength ?? 'hard_constraint',
  };
}

describe('peopleRuleNames', () => {
  it('splits other names on commas and slashes', () => {
    expect(
      peopleRuleNames(rule({ ruleKey: 'Sam Rivera, Sammy / S.R.' }))
    ).toEqual(['Sam Rivera', 'Sammy', 'S.R.']);
  });

  it('ignores rules outside the people category', () => {
    expect(peopleRuleNames(rule({ category: 'visual' }))).toEqual([]);
  });
});

describe('findArtistRuleViolations', () => {
  it('flags a reply that names a protected person, whole word and any case', () => {
    expect(
      findArtistRuleViolations('Tag sammy in the post.', [rule({})])
    ).toEqual([{ ruleId: 'rule-1', category: 'people' }]);
  });

  it('does not match a name inside another word', () => {
    expect(
      findArtistRuleViolations('Shoot it on the Samsung.', [
        rule({ ruleKey: 'Sam' }),
      ])
    ).toEqual([]);
  });

  it('only enforces hard people rules', () => {
    expect(
      findArtistRuleViolations('Sammy could feature.', [
        rule({ strength: 'preference' }),
        rule({ id: 'rule-2', category: 'voice', ruleKey: 'Sammy' }),
      ])
    ).toEqual([]);
  });

  it('is clean with no rules or no text', () => {
    expect(findArtistRuleViolations('Sammy', undefined)).toEqual([]);
    expect(findArtistRuleViolations('  ', [rule({})])).toEqual([]);
  });
});

describe('buildArtistRulesPromptSection', () => {
  it('is empty with no rules', () => {
    expect(buildArtistRulesPromptSection(undefined)).toBe('');
    expect(buildArtistRulesPromptSection([])).toBe('');
  });

  it('lists hard rules before preferences', () => {
    const section = buildArtistRulesPromptSection([
      rule({
        id: 'b',
        category: 'visual',
        instruction: 'Prefer blue over yellow.',
        strength: 'preference',
      }),
      rule({ id: 'a' }),
    ]);
    expect(section).toContain('## Artist Rules');
    const hard = section.indexOf('never feature, name or suggest Sam Rivera');
    const soft = section.indexOf('Prefer (visual): Prefer blue over yellow.');
    expect(hard).toBeGreaterThan(-1);
    expect(soft).toBeGreaterThan(hard);
  });

  it('caps how many rules reach the prompt', () => {
    const many = Array.from({ length: MAX_PROMPT_ARTIST_RULES + 5 }, (_, i) =>
      rule({ id: `r${String(i).padStart(3, '0')}`, category: 'voice' })
    );
    const lines = buildArtistRulesPromptSection(many)
      .split('\n')
      .filter(line => line.startsWith('- '));
    expect(lines).toHaveLength(MAX_PROMPT_ARTIST_RULES);
  });
});

describe('gateAssistantReply with artist rules', () => {
  it('holds back a reply that breaks a people rule and logs it by id', () => {
    const gated = gateAssistantReply('You could bring Sammy on the remix.', {
      artistRules: [rule({})],
    });
    expect(gated.text).toBe(ARTIST_RULE_REPLY_FALLBACK);
    expect(gated.violations).toEqual([
      { rule: 'artist-rule:people', match: 'rule-1' },
    ]);
  });

  it('keeps a clean reply', () => {
    const text = 'Your next release could lead with the remix.';
    expect(gateAssistantReply(text, { artistRules: [rule({})] }).text).toBe(
      text
    );
  });

  it('uses a fallback that passes the copy floor', () => {
    expect(
      lintCopy(ARTIST_RULE_REPLY_FALLBACK, { register: 'jovie-persona' }).ok
    ).toBe(true);
  });
});
