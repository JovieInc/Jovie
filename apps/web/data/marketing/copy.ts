/**
 * Meaning-first marketing copy contracts.
 *
 * A brief can constrain the writing process, but it cannot become the thing
 * we sell. Every rendered line names the customer outcome, a verified claim,
 * or the action the reader can take.
 */

export const MARKETING_COPY_SPEC_VERSION = '1.1.0';

export const MARKETING_COPY_TASTE_TAGS = [
  'direct',
  'editorial',
  'fragment',
  'music-language',
  'negative-framing',
  'plain',
  'provocative',
  'specific',
  'understated',
] as const;

export type MarketingCopyTasteTag = (typeof MARKETING_COPY_TASTE_TAGS)[number];

export interface MarketingCopyClaim {
  readonly id: string;
  readonly statement: string;
  readonly evidence: readonly string[];
}

/** A concrete change the customer gets, not a style instruction. */
export interface MarketingCopyOutcome {
  readonly id: string;
  readonly statement: string;
  readonly claimIds?: readonly string[];
}

export interface MarketingCopyAction {
  readonly id: string;
  readonly statement: string;
}

/** Process/style tokens are inputs to the writer, never benefits by default. */
export interface MarketingCopyInstructionTokens {
  readonly process?: readonly string[];
  readonly style?: readonly string[];
  readonly audience?: readonly string[];
  readonly productCategory?: readonly string[];
}

export interface MarketingCopySectionBrief {
  readonly sectionId: string;
  readonly storyBeat: string;
  readonly sectionJob: string;
  readonly customerOutcome: string;
  readonly messageSubject: string;
  readonly visualEvidence: string;
  readonly allowedClaimIds: readonly string[];
  readonly headlineWordLimit: number;
  readonly headlineSignals: readonly (readonly string[])[];
  readonly bodyWordLimit?: number;
  readonly bodySignals?: readonly (readonly string[])[];
  readonly forbiddenPhrases?: readonly string[];
  readonly literalSequence?: boolean;
}

export interface MarketingCopyPageBrief {
  readonly pageId: string;
  readonly route: string;
  readonly audience: string;
  readonly objective: string;
  readonly claims: readonly MarketingCopyClaim[];
  readonly outcomes?: readonly MarketingCopyOutcome[];
  readonly actions?: readonly MarketingCopyAction[];
  readonly instructionTokens?: MarketingCopyInstructionTokens;
  readonly sections: readonly MarketingCopySectionBrief[];
}

export interface MarketingCopyVisibleCopy {
  readonly headline: string;
  readonly body?: string;
  readonly supportingText?: readonly string[];
}

export const MARKETING_COPY_LINE_ROLES = [
  'headline',
  'body',
  'supporting',
] as const;

export type MarketingCopyLineRole = (typeof MARKETING_COPY_LINE_ROLES)[number];

/** Metadata for the generator/reviewer, never rendered to the audience. */
export interface MarketingCopyLineBinding {
  readonly lineId: string;
  readonly role: MarketingCopyLineRole;
  readonly outcomeId?: string;
  readonly claimIds?: readonly string[];
  readonly actionId?: string;
}

export interface MarketingCopySectionDraft extends MarketingCopyVisibleCopy {
  readonly sectionId: string;
  readonly candidateId: string;
  readonly control: MarketingCopyVisibleCopy;
  readonly claimIds: readonly string[];
  readonly lineBindings?: readonly MarketingCopyLineBinding[];
  readonly meaningTrace: string;
  readonly tasteTags: readonly MarketingCopyTasteTag[];
}

export interface MarketingCopyPageDraft {
  readonly pageId: string;
  readonly route: string;
  readonly sections: readonly MarketingCopySectionDraft[];
}

export interface MarketingCopyAuditIssue {
  readonly code: string;
  readonly sectionId?: string;
  readonly message: string;
}

export const MARKETING_COPY_SEMANTIC_ENFORCEMENTS = [
  'shadow',
  'delta',
] as const;
export type MarketingCopySemanticEnforcement =
  (typeof MARKETING_COPY_SEMANTIC_ENFORCEMENTS)[number];

export interface MarketingCopySemanticAudit {
  readonly mode: MarketingCopySemanticEnforcement;
  readonly status: 'pass' | 'advisory' | 'fail';
  readonly blocking: boolean;
  readonly lineCount: number;
  readonly issueCounts: Readonly<Record<string, number>>;
  readonly issues: readonly MarketingCopyAuditIssue[];
}

export interface MarketingCopySemanticAuditOptions {
  readonly enforcement?: MarketingCopySemanticEnforcement;
  readonly changedSectionIds?: readonly string[];
}

interface VisibleLine {
  readonly lineId: string;
  readonly role: MarketingCopyLineRole;
  readonly value: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'be',
  'can',
  'each',
  'every',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'more',
  'of',
  'one',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'two',
  'when',
  'with',
  'your',
]);

const META_PATTERN =
  /\b(?:brief|prompt|copy|headline|heading|section|layout|design system|word count|h[1-6]|hero|callout)\b/i;
const LAYOUT_PATTERN =
  /\b(?:headline|heading|copy|section|layout|hero|card|callout|page)\b/i;
const BUILT_FOR_PATTERN =
  /\b(?:built|made|designed)\s+for\s+([a-z][a-z -]{1,36})/i;
const FEATURE_WORDS = new Set([
  'ai',
  'analytics',
  'automations',
  'dashboard',
  'features',
  'integrations',
  'links',
  'notifications',
  'tools',
  'workflows',
]);
const ACTION_PATTERN =
  /\b(?:act|adapts?|brings?|capture|claim|choose|connect|find|fits|follow|gives?|keeps?|land|lead|listen|move|open|puts?|reach|send|share|show(?:s)?|stay(?:s)?|support|turns?|use|visit)\b/i;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[’']/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function meaningfulWords(value: string): string[] {
  return words(value).filter(word => !STOP_WORDS.has(word));
}

function normalizedTokenWords(tokens: readonly string[]): Set<string> {
  return new Set(tokens.flatMap(token => meaningfulWords(token)));
}

function tokenHits(value: string, tokens: readonly string[]): string[] {
  const normalized = ` ${normalizeText(value)} `;
  return tokens.filter(token =>
    normalized.includes(` ${normalizeText(token)} `)
  );
}

function audienceWords(brief: MarketingCopyPageBrief): Set<string> {
  return normalizedTokenWords([
    ...(brief.instructionTokens?.audience ?? []),
    ...words(brief.audience),
  ]);
}

function matchesAudience(value: string, registered: Set<string>): boolean {
  return meaningfulWords(value).some(word =>
    [...registered].some(
      audienceWord =>
        word === audienceWord ||
        word.startsWith(audienceWord) ||
        audienceWord.startsWith(word)
    )
  );
}

function visibleLines(section: MarketingCopySectionDraft): VisibleLine[] {
  const lines: VisibleLine[] = [
    { lineId: 'headline', role: 'headline', value: section.headline },
  ];
  if (section.body !== undefined) {
    lines.push({ lineId: 'body', role: 'body', value: section.body });
  }
  for (const [index, value] of (section.supportingText ?? []).entries()) {
    lines.push({ lineId: `supporting:${index}`, role: 'supporting', value });
  }
  return lines;
}

function issue(
  code: string,
  sectionId: string | undefined,
  message: string
): MarketingCopyAuditIssue {
  return { code, sectionId, message };
}

/**
 * Context-aware anti-meta-copy guard. Shadow mode reports legacy debt;
 * delta mode blocks only new or changed sections.
 */
export function auditMarketingCopySemantics(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  options: MarketingCopySemanticAuditOptions = {}
): MarketingCopySemanticAudit {
  const mode = options.enforcement ?? 'shadow';
  const changed = options.changedSectionIds
    ? new Set(options.changedSectionIds)
    : undefined;
  const sections = draft.sections.filter(
    section => !changed || changed.has(section.sectionId)
  );
  const issues: MarketingCopyAuditIssue[] = [];
  const outcomes = brief.outcomes ?? [];
  const outcomesById = new Map(outcomes.map(outcome => [outcome.id, outcome]));
  const actionsById = new Map(
    (brief.actions ?? []).map(action => [action.id, action])
  );
  const claimsById = new Map(brief.claims.map(claim => [claim.id, claim]));
  const sectionBriefs = new Map(
    brief.sections.map(section => [section.sectionId, section])
  );
  const processTokens = brief.instructionTokens?.process ?? [];
  const styleTokens = brief.instructionTokens?.style ?? [];
  const productTokens = brief.instructionTokens?.productCategory ?? [];
  const instructionWords = normalizedTokenWords([
    ...processTokens,
    ...styleTokens,
    ...(brief.instructionTokens?.audience ?? []),
  ]);
  const registeredAudience = audienceWords(brief);

  if (sections.length > 0 && outcomes.length === 0) {
    issues.push(
      issue(
        'missing-outcome-registry',
        undefined,
        'Every delta-reviewed page needs a registered customer outcome.'
      )
    );
  }
  for (const outcome of outcomes) {
    if (!outcome.id.trim() || meaningfulWords(outcome.statement).length < 3) {
      issues.push(
        issue(
          'invalid-outcome',
          undefined,
          'Every outcome needs a stable ID and concrete customer statement.'
        )
      );
    }
    for (const claimId of outcome.claimIds ?? []) {
      if (!claimsById.has(claimId)) {
        issues.push(
          issue(
            'unknown-outcome-claim',
            undefined,
            `Outcome ${outcome.id || '(missing ID)'} cites unknown claim ${claimId}.`
          )
        );
      }
    }
  }
  for (const action of brief.actions ?? []) {
    if (!action.id.trim() || meaningfulWords(action.statement).length < 2) {
      issues.push(
        issue(
          'invalid-action',
          undefined,
          'Every action needs a stable ID and concrete user verb.'
        )
      );
    }
  }

  let lineCount = 0;
  for (const section of sections) {
    const sectionBrief = sectionBriefs.get(section.sectionId);
    const lines = visibleLines(section);
    lineCount += lines.length;
    const bindings = section.lineBindings ?? [];
    const bindingsById = new Map<string, MarketingCopyLineBinding>();

    for (const binding of bindings) {
      if (bindingsById.has(binding.lineId)) {
        issues.push(
          issue(
            'duplicate-line-binding',
            section.sectionId,
            `Visible line ${binding.lineId} is bound more than once.`
          )
        );
      }
      bindingsById.set(binding.lineId, binding);
      if (!MARKETING_COPY_LINE_ROLES.includes(binding.role)) {
        issues.push(
          issue(
            'invalid-line-role',
            section.sectionId,
            `Line ${binding.lineId} has an unknown semantic role.`
          )
        );
      }
      if (
        !binding.outcomeId &&
        !(binding.claimIds?.length ?? 0) &&
        !binding.actionId
      ) {
        issues.push(
          issue(
            'unbound-visible-line',
            section.sectionId,
            `Visible line ${binding.lineId} must name an outcome, claim, or action.`
          )
        );
      }
      if (binding.outcomeId && !outcomesById.has(binding.outcomeId)) {
        issues.push(
          issue(
            'unknown-outcome',
            section.sectionId,
            `Line ${binding.lineId} cites unknown outcome ${binding.outcomeId}.`
          )
        );
      }
      if (binding.actionId && !actionsById.has(binding.actionId)) {
        issues.push(
          issue(
            'unknown-action',
            section.sectionId,
            `Line ${binding.lineId} cites unknown action ${binding.actionId}.`
          )
        );
      }
      const boundOutcome = binding.outcomeId
        ? outcomesById.get(binding.outcomeId)
        : undefined;
      if (boundOutcome && sectionBrief) {
        for (const claimId of boundOutcome.claimIds ?? []) {
          if (!sectionBrief.allowedClaimIds.includes(claimId)) {
            issues.push(
              issue(
                'outcome-claim-out-of-scope',
                section.sectionId,
                `Outcome ${boundOutcome.id} cites claim ${claimId}, which is not allowed here.`
              )
            );
          }
        }
      }
      for (const claimId of binding.claimIds ?? []) {
        if (!claimsById.has(claimId)) {
          issues.push(
            issue(
              'unknown-line-claim',
              section.sectionId,
              `Line ${binding.lineId} cites unknown claim ${claimId}.`
            )
          );
        }
        if (sectionBrief && !sectionBrief.allowedClaimIds.includes(claimId)) {
          issues.push(
            issue(
              'line-claim-out-of-scope',
              section.sectionId,
              `Line ${binding.lineId} cites claim ${claimId}, which is not allowed here.`
            )
          );
        }
      }
    }

    const visibleIds = new Set(lines.map(line => line.lineId));
    for (const binding of bindings) {
      if (!visibleIds.has(binding.lineId)) {
        issues.push(
          issue(
            'orphan-line-binding',
            section.sectionId,
            `Line binding ${binding.lineId} does not correspond to rendered copy.`
          )
        );
      }
    }

    for (const line of lines) {
      const binding = bindingsById.get(line.lineId);
      if (!binding) {
        issues.push(
          issue(
            'unbound-visible-line',
            section.sectionId,
            `Visible ${line.role} ${line.lineId} has no semantic binding.`
          )
        );
      } else if (binding.role !== line.role) {
        issues.push(
          issue(
            'line-role-mismatch',
            section.sectionId,
            `Line ${line.lineId} is rendered as ${line.role} but bound as ${binding.role}.`
          )
        );
      }

      const processHits = tokenHits(line.value, processTokens);
      const styleHits = tokenHits(line.value, styleTokens);
      const productHits = tokenHits(line.value, productTokens);
      const lineWords = meaningfulWords(line.value);
      const instructionHits = lineWords.filter(word =>
        instructionWords.has(word)
      );
      const nonInstructionWords = lineWords.filter(
        word => !instructionWords.has(word)
      );
      const boundToOutcome = Boolean(
        binding?.outcomeId && outcomesById.has(binding.outcomeId)
      );
      const hasAction = ACTION_PATTERN.test(line.value);
      const hasProductSubject =
        productHits.length > 0 ||
        /\b(?:artist|fan|music|release|show|ticket|support|profile|link|action|catalog|alert|notification)\b/i.test(
          line.value
        );

      if (
        META_PATTERN.test(line.value) &&
        (processHits.length > 0 ||
          styleHits.length > 0 ||
          /\b(?:one|a|the)\s+\w+\s+(?:heading|headline|section|copy|layout)\b/i.test(
            line.value
          ))
      ) {
        issues.push(
          issue(
            'meta-copy',
            section.sectionId,
            `The ${line.role} describes the brief or layout instead of the outcome: "${line.value}".`
          )
        );
      }
      if (
        line.role === 'headline' &&
        LAYOUT_PATTERN.test(line.value) &&
        (processHits.length > 0 || styleHits.length > 0)
      ) {
        issues.push(
          issue(
            'headline-layout-copy',
            section.sectionId,
            `The headline describes copy/layout work rather than product value: "${line.value}".`
          )
        );
      }
      if (
        instructionHits.length > 0 &&
        nonInstructionWords.length <= 1 &&
        !hasAction &&
        !hasProductSubject
      ) {
        issues.push(
          issue(
            'brief-parroting',
            section.sectionId,
            `The ${line.role} repeats writing instructions without an outcome: "${line.value}".`
          )
        );
      }
      if (
        styleHits.length > 0 &&
        !hasAction &&
        lineWords.length <= 7 &&
        (!boundToOutcome || /^(?:a|an|the)\b/i.test(line.value))
      ) {
        issues.push(
          issue(
            'style-adjective-substitution',
            section.sectionId,
            `Style language is standing in for a customer benefit: "${line.value}".`
          )
        );
      }

      const builtFor = BUILT_FOR_PATTERN.exec(line.value);
      if (builtFor && !matchesAudience(builtFor[1] ?? '', registeredAudience)) {
        issues.push(
          issue(
            'audience-product-category-mismatch',
            section.sectionId,
            `The line targets "${(builtFor[1] ?? '').trim()}" but the brief is for ${brief.audience}: "${line.value}".`
          )
        );
        issues.push(
          issue(
            'built-for-wrong-noun',
            section.sectionId,
            `"Built for X" names the wrong audience/product noun: "${line.value}".`
          )
        );
      }

      const featureHits = lineWords.filter(word => FEATURE_WORDS.has(word));
      const listSegments = line.value
        .split(/,|\band\b|\+|\|/i)
        .map(segment => segment.trim())
        .filter(Boolean);
      if (featureHits.length >= 3 && listSegments.length >= 3 && !hasAction) {
        issues.push(
          issue(
            'generic-feature-soup',
            section.sectionId,
            `The ${line.role} lists features without naming the customer change: "${line.value}".`
          )
        );
      }
    }
  }

  const issueCounts = issues.reduce<Record<string, number>>(
    (counts, current) => {
      counts[current.code] = (counts[current.code] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const blocking = mode === 'delta' && issues.length > 0;
  return {
    mode,
    status: issues.length === 0 ? 'pass' : blocking ? 'fail' : 'advisory',
    blocking,
    lineCount,
    issueCounts,
    issues,
  };
}
