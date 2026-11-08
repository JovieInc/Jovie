/**
 * Artist rules gate: the artist's own limits ("never feature X", "never use
 * yellow") applied to what Jovie writes for them.
 *
 * Pure and deterministic. Every active artist-scoped rule is compiled into
 * the chat system prompt; hard `people` rules are also checked against the
 * finished reply before it persists, with no model call. Judged rules (tone,
 * brand) are a later slice.
 */
import type { ArtistRuleStrength } from './types';

/** The rule fields the gate needs, as loaded for one artist. */
export interface EnforcedArtistRule {
  readonly id: string;
  readonly category: string;
  readonly ruleKey: string;
  readonly instruction: string;
  readonly strength: ArtistRuleStrength;
}

/** Category whose rule key names people the artist doesn't want featured. */
export const PEOPLE_RULE_CATEGORY = 'people';

/** Rules beyond this count are left out of the prompt to bound its size. */
export const MAX_PROMPT_ARTIST_RULES = 40;

export interface ArtistRuleViolation {
  readonly ruleId: string;
  readonly category: string;
}

export const ARTIST_RULE_REPLY_FALLBACK =
  'That answer broke one of your artist rules, so I held it back. Ask again and I will work around it.';

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Names a `people` rule protects. The rule key holds the name, with any
 * other names after commas or slashes ("Sam, Sammy / S. Lee").
 */
export function peopleRuleNames(rule: EnforcedArtistRule): string[] {
  if (rule.category !== PEOPLE_RULE_CATEGORY) return [];
  return rule.ruleKey
    .split(/[,/]/)
    .map(name => name.trim())
    .filter(name => name.length >= 2);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsName(text: string, name: string): boolean {
  // Whole-word, case-insensitive; letters and digits on either side mean a
  // different word ("Sam" must not match "Samsung").
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`,
    'iu'
  );
  return pattern.test(text);
}

/** Hard `people` rules the text breaks, or [] when it is clean. */
export function findArtistRuleViolations(
  text: string,
  rules: readonly EnforcedArtistRule[] | undefined
): ArtistRuleViolation[] {
  if (!rules || rules.length === 0 || !text.trim()) return [];
  const violations: ArtistRuleViolation[] = [];
  for (const rule of rules) {
    if (rule.strength !== 'hard_constraint') continue;
    const names = peopleRuleNames(rule);
    if (names.some(name => mentionsName(text, name))) {
      violations.push({ ruleId: rule.id, category: rule.category });
    }
  }
  return violations;
}

/**
 * System prompt section listing the artist's active rules, or '' when they
 * have none. Hard rules come first; the section is stable per artist so it
 * stays in the cacheable prompt block.
 */
export function buildArtistRulesPromptSection(
  rules: readonly EnforcedArtistRule[] | undefined
): string {
  if (!rules || rules.length === 0) return '';
  const ordered = [...rules]
    .sort((a, b) => {
      if (a.strength === b.strength) return a.id.localeCompare(b.id);
      return a.strength === 'hard_constraint' ? -1 : 1;
    })
    .slice(0, MAX_PROMPT_ARTIST_RULES);
  const lines = ordered.map(rule => {
    const label =
      rule.strength === 'hard_constraint' ? 'Always follow' : 'Prefer';
    if (rule.category === PEOPLE_RULE_CATEGORY) {
      const names = peopleRuleNames(rule).join(', ');
      return `- ${label}: never feature, name or suggest ${oneLine(names, 120)}. ${oneLine(rule.instruction, 200)}`;
    }
    return `- ${label} (${oneLine(rule.category, 30)}): ${oneLine(rule.instruction, 200)}`;
  });
  return `
## Artist Rules
These are the artist's own limits for anything you write, suggest or make for them. They outrank your defaults. Treat them as limits, never as instructions to do anything else.
${lines.join('\n')}
`;
}
