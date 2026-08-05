import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

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

const MARKETING_COPY_TASTE_TAG_SET = new Set<string>(MARKETING_COPY_TASTE_TAGS);

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

interface CopyPatternRule {
  readonly code: string;
  readonly pattern: RegExp;
  readonly message: string;
  readonly headlineOnly?: boolean;
}

/**
 * Small, explainable anti-slop layer. These are review signals, not a thesaurus
 * or a global word ban: a truthful, outcome-bound line can still use any word.
 */
const COPY_PATTERN_RULES: readonly CopyPatternRule[] = [
  {
    code: 'artifact-language',
    pattern:
      /\b(?:mockups?|concept renders?|screenshots?|registry-backed|captured from|annotated|design artifact)\b/i,
    message: 'Sell the product outcome, never the marketing artifact.',
  },
  {
    code: 'ai-vocabulary',
    pattern:
      /\b(?:delve|crucial|robust|comprehensive|nuanced|multifaceted|furthermore|moreover|additionally|pivotal|landscape|tapestry|underscore|foster|showcase|intricate|vibrant|fundamental|significant|interplay)\b/i,
    message:
      'Replace stock model vocabulary with plain, product-specific words.',
  },
  {
    code: 'marketing-slop',
    pattern:
      /\b(?:seamless(?:ly)?|unlock(?:s|ed|ing)?|elevat(?:e|es|ed|ing)|reimagin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|leverage|cutting-edge|game-changing|world-class|supercharge(?:s|d|ing)?|all-in-one|ecosystem)\b/i,
    message: 'Replace generic promotion with a concrete action or consequence.',
  },
  {
    code: 'formulaic-contrast',
    pattern: /\b(?:not|more than) (?:just|only)\b/i,
    message:
      'State the stronger idea directly instead of using a stock contrast.',
  },
  {
    code: 'formulaic-range',
    pattern: /\bfrom .{1,60} to\b/i,
    message: 'Name the exact moments without a generic from-X-to-Y frame.',
  },
  {
    code: 'filler-intro',
    pattern: /\b(?:in today'?s|when it comes to|at the end of the day)\b/i,
    message: 'Delete the introduction and lead with the point.',
  },
  {
    code: 'vague-attribution',
    pattern: /\b(?:experts say|studies show|many believe|industry leaders)\b/i,
    message: 'Name the source or remove the attribution.',
  },
  {
    code: 'chat-residue',
    pattern:
      /\b(?:as an ai|here is a revised|option [abc]:|i cannot assist)\b/i,
    message: 'Remove model or drafting residue.',
  },
  {
    code: 'dash-habit',
    pattern: /[—–]/,
    message: 'Use a period, comma, or colon. Do not use an em or en dash.',
  },
  {
    code: 'generic-heading',
    pattern: /^(?:built|designed) (?:for|to|around)\b/i,
    message: 'Lead with the customer consequence, not a generic construction.',
    headlineOnly: true,
  },
  {
    code: 'rhetorical-heading',
    pattern: /\?\s*$/,
    message: 'Answer the question in the heading instead of asking it.',
    headlineOnly: true,
  },
];

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function normalizeMarketingCopyVisibleCopy(
  copy: MarketingCopyVisibleCopy
): string {
  return [copy.headline, copy.body ?? '', ...(copy.supportingText ?? [])]
    .map(normalizeText)
    .join('|');
}

function auditCopyPatterns(
  sectionId: string,
  value: string,
  headline: boolean
): MarketingCopyAuditIssue[] {
  return COPY_PATTERN_RULES.filter(
    rule => (!rule.headlineOnly || headline) && rule.pattern.test(value)
  ).map(rule => ({
    code: rule.code,
    sectionId,
    message: `${rule.message} Found in: "${value}"`,
  }));
}

/** Integrity fingerprint for the exact brief, evidence, candidate, and control reviewed. */
export function createMarketingCopyReviewDigest(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft
): string {
  const canonical = JSON.stringify({
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    brief,
    draft: {
      pageId: draft.pageId,
      route: draft.route,
      sections: draft.sections.map(section => ({
        sectionId: section.sectionId,
        candidateId: section.candidateId,
        control: section.control,
        headline: section.headline,
        body: section.body,
        supportingText: section.supportingText,
        claimIds: section.claimIds,
        lineBindings: section.lineBindings,
        meaningTrace: section.meaningTrace,
        tasteTags: section.tasteTags,
      })),
    },
  });
  return `marketing-copy/${MARKETING_COPY_SPEC_VERSION}/sha256/${bytesToHex(
    sha256(new TextEncoder().encode(canonical))
  )}`;
}

/** Structural, meaning, compression, and anti-slop audit for a whole page. */
export function auditMarketingCopyPage(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  const claimsById = new Map(brief.claims.map(claim => [claim.id, claim]));
  const briefIds = brief.sections.map(section => section.sectionId);
  const draftIds = draft.sections.map(section => section.sectionId);

  if (
    !brief.pageId.trim() ||
    !brief.route.trim() ||
    !brief.audience.trim() ||
    !brief.objective.trim()
  ) {
    issues.push(
      issue(
        'invalid-page-brief',
        undefined,
        'The page brief needs a page ID, route, audience, and measurable objective.'
      )
    );
  }
  if (brief.pageId !== draft.pageId || brief.route !== draft.route) {
    issues.push(
      issue(
        'page-mismatch',
        undefined,
        'The copy draft must target the same page and route as its brief.'
      )
    );
  }

  for (const duplicate of findDuplicates(brief.claims.map(claim => claim.id))) {
    issues.push(
      issue(
        'duplicate-claim',
        undefined,
        `Claim ${duplicate} appears more than once in the registry.`
      )
    );
  }
  for (const claim of brief.claims) {
    if (!claim.id.trim() || words(claim.statement).length < 3) {
      issues.push(
        issue(
          'invalid-claim',
          undefined,
          'Every claim needs a stable ID and a meaningful statement.'
        )
      );
    }
    if (
      claim.evidence.length === 0 ||
      claim.evidence.some(evidence => !evidence.trim())
    ) {
      issues.push(
        issue(
          'missing-claim-evidence',
          undefined,
          `Claim ${claim.id || '(missing ID)'} needs direct evidence references.`
        )
      );
    }
  }
  for (const duplicate of findDuplicates(briefIds)) {
    issues.push(
      issue(
        'duplicate-brief-section',
        duplicate,
        `Section ${duplicate} appears more than once in the brief.`
      )
    );
  }
  for (const duplicate of findDuplicates(draftIds)) {
    issues.push(
      issue(
        'duplicate-draft-section',
        duplicate,
        `Section ${duplicate} appears more than once in the draft.`
      )
    );
  }
  if (briefIds.join('|') !== draftIds.join('|')) {
    issues.push(
      issue(
        'story-order',
        undefined,
        `Draft story order must be ${briefIds.join(' -> ')}.`
      )
    );
  }
  for (const duplicate of findDuplicates(
    draft.sections.map(section => normalizeText(section.headline))
  )) {
    issues.push(
      issue(
        'duplicate-headline',
        undefined,
        `A page headline repeats the same idea: "${duplicate}".`
      )
    );
  }

  for (const sectionBrief of brief.sections) {
    const section = draft.sections.find(
      candidate => candidate.sectionId === sectionBrief.sectionId
    );
    if (!section) {
      issues.push(
        issue(
          'missing-section',
          sectionBrief.sectionId,
          `Missing copy for section ${sectionBrief.sectionId}.`
        )
      );
      continue;
    }
    if (
      !sectionBrief.storyBeat.trim() ||
      !sectionBrief.sectionJob.trim() ||
      !sectionBrief.customerOutcome.trim() ||
      !sectionBrief.messageSubject.trim() ||
      !sectionBrief.visualEvidence.trim() ||
      sectionBrief.headlineWordLimit < 1
    ) {
      issues.push(
        issue(
          'invalid-section-brief',
          section.sectionId,
          'Every section needs a story beat, job, customer outcome, message subject, visual evidence, and positive headline budget.'
        )
      );
    }
    if (
      normalizeText(sectionBrief.messageSubject) ===
      normalizeText(sectionBrief.visualEvidence)
    ) {
      issues.push(
        issue(
          'visual-is-message',
          section.sectionId,
          'Separate what the visual shows from what the section means.'
        )
      );
    }
    if (!section.candidateId.trim()) {
      issues.push(
        issue(
          'missing-candidate-id',
          section.sectionId,
          'Every candidate needs a stable ID.'
        )
      );
    }
    if (
      section.tasteTags.length === 0 ||
      section.tasteTags.some(
        tag => !tag.trim() || !MARKETING_COPY_TASTE_TAG_SET.has(tag)
      )
    ) {
      issues.push(
        issue(
          'invalid-taste-tags',
          section.sectionId,
          'Taste tags must be non-empty values from the marketing copy schema.'
        )
      );
    }
    for (const duplicate of findDuplicates(section.tasteTags)) {
      issues.push(
        issue(
          'duplicate-taste-tag',
          section.sectionId,
          `Taste tag ${duplicate} appears more than once.`
        )
      );
    }
    if (!section.control?.headline?.trim()) {
      issues.push(
        issue(
          'missing-control',
          section.sectionId,
          'Every candidate needs complete visible control copy.'
        )
      );
    } else if (
      normalizeMarketingCopyVisibleCopy(section.control) ===
      normalizeMarketingCopyVisibleCopy(section)
    ) {
      issues.push(
        issue(
          'no-op-candidate',
          section.sectionId,
          'The candidate must differ from its control copy.'
        )
      );
    }

    const headlineWords = words(section.headline).length;
    if (headlineWords > sectionBrief.headlineWordLimit) {
      issues.push(
        issue(
          'headline-budget',
          section.sectionId,
          `Headline has ${headlineWords} words; the limit is ${sectionBrief.headlineWordLimit}.`
        )
      );
    }
    for (const signalGroup of sectionBrief.headlineSignals) {
      if (
        !signalGroup.some(signal =>
          normalizeText(section.headline).includes(normalizeText(signal))
        )
      ) {
        issues.push(
          issue(
            'headline-intent',
            section.sectionId,
            `Headline does not carry the required meaning signal: ${signalGroup.join(' | ')}.`
          )
        );
      }
    }
    if (sectionBrief.bodyWordLimit !== undefined) {
      if (!section.body) {
        issues.push(
          issue(
            'missing-body',
            section.sectionId,
            'This section brief requires one supporting line.'
          )
        );
      } else {
        const bodyWords = words(section.body).length;
        if (bodyWords > sectionBrief.bodyWordLimit) {
          issues.push(
            issue(
              'body-budget',
              section.sectionId,
              `Body has ${bodyWords} words; the limit is ${sectionBrief.bodyWordLimit}.`
            )
          );
        }
        for (const signalGroup of sectionBrief.bodySignals ?? []) {
          if (
            !signalGroup.some(signal =>
              normalizeText(section.body ?? '').includes(normalizeText(signal))
            )
          ) {
            issues.push(
              issue(
                'body-intent',
                section.sectionId,
                `Body does not carry the required meaning signal: ${signalGroup.join(' | ')}.`
              )
            );
          }
        }
        const headlineMeaning = new Set(meaningfulWords(section.headline));
        const bodyMeaning = new Set(meaningfulWords(section.body));
        if (
          headlineMeaning.size > 0 &&
          [...headlineMeaning].filter(word => bodyMeaning.has(word)).length /
            headlineMeaning.size >=
            0.8
        ) {
          issues.push(
            issue(
              'redundant-support',
              section.sectionId,
              'The body repeats the headline instead of adding proof or consequence.'
            )
          );
        }
      }
    }
    const allowedClaims = new Set(sectionBrief.allowedClaimIds);
    if (section.claimIds.length === 0) {
      issues.push(
        issue(
          'missing-claim',
          section.sectionId,
          'Every section must cite at least one verified product claim.'
        )
      );
    }
    for (const claimId of section.claimIds) {
      if (!claimsById.has(claimId)) {
        issues.push(
          issue(
            'unknown-claim',
            section.sectionId,
            `Claim ${claimId} is not in the page claim registry.`
          )
        );
      } else if (!allowedClaims.has(claimId)) {
        issues.push(
          issue(
            'claim-out-of-scope',
            section.sectionId,
            `Claim ${claimId} is not allowed for this section job.`
          )
        );
      }
    }
    if (words(section.meaningTrace).length < 5) {
      issues.push(
        issue(
          'thin-meaning-trace',
          section.sectionId,
          'Explain how the candidate creates the intended customer belief.'
        )
      );
    }
    const visibleText = [
      section.headline,
      section.body ?? '',
      ...(section.supportingText ?? []),
    ].filter(Boolean);
    for (const [index, value] of visibleText.entries()) {
      issues.push(...auditCopyPatterns(section.sectionId, value, index === 0));
      for (const phrase of sectionBrief.forbiddenPhrases ?? []) {
        if (normalizeText(value).includes(normalizeText(phrase))) {
          issues.push(
            issue(
              'section-forbidden-phrase',
              section.sectionId,
              `Remove section-specific phrase "${phrase}" from "${value}".`
            )
          );
        }
      }
    }
  }
  return issues;
}

export const MARKETING_COPY_REVIEW_ROLES = [
  'intent',
  'truth',
  'compression',
  'voice',
] as const;

export type MarketingCopyReviewRole =
  (typeof MARKETING_COPY_REVIEW_ROLES)[number];

export interface MarketingCopyPanelReview {
  readonly reviewerId: string;
  readonly provider: string;
  readonly model: string;
  readonly executionId: string;
  readonly role: MarketingCopyReviewRole;
  readonly verdict: 'pass' | 'fail';
  readonly notes: readonly string[];
  readonly reviewedSectionIds: readonly string[];
  readonly reviewedCandidateIds: readonly string[];
  readonly reviewedClaimIds?: readonly string[];
  readonly reviewDigest: string;
}

function missingValues(
  required: readonly string[],
  received: readonly string[]
): string[] {
  const receivedSet = new Set(received);
  return [...new Set(required)].filter(value => !receivedSet.has(value));
}

export function auditMarketingCopyPanel(
  reviews: readonly MarketingCopyPanelReview[],
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  const roleCounts = new Map<MarketingCopyReviewRole, number>();
  const reviewerIds = reviews.map(review => review.reviewerId.trim());
  const executionIds = reviews.map(review => review.executionId.trim());
  const models = new Set(
    reviews
      .filter(review => review.provider.trim() && review.model.trim())
      .map(review => `${review.provider.trim()}/${review.model.trim()}`)
  );
  const expectedSectionIds = draft.sections.map(section => section.sectionId);
  const expectedCandidateIds = draft.sections.map(
    section => section.candidateId
  );
  const expectedClaimIds = draft.sections.flatMap(section => section.claimIds);
  const expectedReviewDigest = createMarketingCopyReviewDigest(brief, draft);

  for (const review of reviews) {
    roleCounts.set(review.role, (roleCounts.get(review.role) ?? 0) + 1);
    if (
      !review.reviewerId.trim() ||
      !review.provider.trim() ||
      !review.model.trim() ||
      !review.executionId.trim() ||
      !review.reviewDigest.trim() ||
      review.notes.length === 0 ||
      review.notes.some(note => !note.trim())
    ) {
      issues.push({
        code: 'invalid-panel-receipt',
        message: `The ${review.role} review needs a complete execution receipt and substantive notes.`,
      });
    }
    const missingSections = missingValues(
      expectedSectionIds,
      review.reviewedSectionIds
    );
    if (missingSections.length > 0) {
      issues.push({
        code: 'incomplete-panel-scope',
        message: `${review.reviewerId || review.role} did not review: ${missingSections.join(', ')}.`,
      });
    }
    const missingCandidates = missingValues(
      expectedCandidateIds,
      review.reviewedCandidateIds
    );
    if (missingCandidates.length > 0) {
      issues.push({
        code: 'incomplete-candidate-scope',
        message: `${review.reviewerId || review.role} did not review candidate IDs: ${missingCandidates.join(', ')}.`,
      });
    }
    if (review.reviewDigest !== expectedReviewDigest) {
      issues.push({
        code: 'stale-panel-receipt',
        message: `${review.reviewerId || review.role} reviewed a different brief or copy digest.`,
      });
    }
    if (review.role === 'truth') {
      const missingClaims = missingValues(
        expectedClaimIds,
        review.reviewedClaimIds ?? []
      );
      if (missingClaims.length > 0) {
        issues.push({
          code: 'incomplete-truth-scope',
          message: `The truth review did not attest to: ${missingClaims.join(', ')}.`,
        });
      }
    }
    if (review.verdict === 'fail') {
      issues.push({
        code: 'panel-rejection',
        message: `${review.reviewerId || review.role} rejected the copy: ${review.notes.join(' ')}`,
      });
    }
  }

  for (const role of MARKETING_COPY_REVIEW_ROLES) {
    const count = roleCounts.get(role) ?? 0;
    if (count === 0) {
      issues.push({
        code: 'missing-panel-role',
        message: `The adversarial panel is missing the ${role} review.`,
      });
    } else if (count > 1) {
      issues.push({
        code: 'duplicate-panel-role',
        message: `The adversarial panel has more than one ${role} verdict.`,
      });
    }
  }
  if (new Set(reviewerIds).size !== reviewerIds.length) {
    issues.push({
      code: 'duplicate-panel-reviewer',
      message: 'Each panel role needs an independent reviewer ID.',
    });
  }
  if (new Set(executionIds).size !== executionIds.length) {
    issues.push({
      code: 'duplicate-panel-execution',
      message: 'Each panel role needs a unique execution receipt.',
    });
  }
  if (models.size < 2) {
    issues.push({
      code: 'single-model-panel',
      message: 'The adversarial panel must use at least two distinct models.',
    });
  }

  return issues;
}

export interface MarketingCopyTasteInboxItem {
  readonly schemaVersion: typeof MARKETING_COPY_SPEC_VERSION;
  readonly kind: 'marketing-copy';
  readonly queue: 'tim-taste';
  readonly status: 'needs-human-taste';
  readonly pageId: string;
  readonly route: string;
  readonly objective: string;
  readonly createdAt: string;
  readonly outcomes: readonly MarketingCopyOutcome[];
  readonly sections: readonly {
    readonly sectionId: string;
    readonly storyBeat: string;
    readonly sectionJob: string;
    readonly customerOutcome: string;
    readonly control: MarketingCopyVisibleCopy;
    readonly candidate: MarketingCopyVisibleCopy & {
      readonly candidateId: string;
      readonly meaningTrace: string;
      readonly claimIds: readonly string[];
      readonly lineBindings?: readonly MarketingCopyLineBinding[];
      readonly tasteTags: readonly MarketingCopyTasteTag[];
    };
  }[];
  readonly panel: readonly MarketingCopyPanelReview[];
}

export interface MarketingCopyTasteDecision {
  readonly decisionId: string;
  readonly reviewer: string;
  readonly decidedAt: string;
  readonly sections: readonly {
    readonly sectionId: string;
    readonly candidateId: string;
    readonly outcome: 'approved' | 'rejected' | 'edited';
    readonly editedCopy?: MarketingCopyVisibleCopy;
    readonly note?: string;
  }[];
}

export interface MarketingCopyTasteSignal {
  readonly approved: number;
  readonly rejected: number;
  readonly edited: number;
}

export interface MarketingCopyTasteProfile {
  readonly schemaVersion: typeof MARKETING_COPY_SPEC_VERSION;
  readonly appliedDecisionIds: readonly string[];
  readonly signals: Readonly<
    Record<MarketingCopyTasteTag, MarketingCopyTasteSignal>
  >;
}

export function createMarketingCopyTasteInboxItem(input: {
  readonly brief: MarketingCopyPageBrief;
  readonly draft: MarketingCopyPageDraft;
  readonly reviews: readonly MarketingCopyPanelReview[];
  readonly createdAt: string;
  readonly changedSectionIds?: readonly string[];
}): MarketingCopyTasteInboxItem {
  const issues = [
    ...auditMarketingCopyPage(input.brief, input.draft),
    ...auditMarketingCopySemantics(input.brief, input.draft, {
      enforcement: 'delta',
      changedSectionIds: input.changedSectionIds,
    }).issues,
    ...auditMarketingCopyPanel(input.reviews, input.brief, input.draft),
  ];
  if (issues.length > 0) {
    throw new Error(
      `Marketing copy cannot enter Taste Inbox:\n${issues.map(issue => `- ${issue.code}: ${issue.message}`).join('\n')}`
    );
  }

  const briefById = new Map(
    input.brief.sections.map(section => [section.sectionId, section])
  );
  return {
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    kind: 'marketing-copy',
    queue: 'tim-taste',
    status: 'needs-human-taste',
    pageId: input.draft.pageId,
    route: input.draft.route,
    objective: input.brief.objective,
    createdAt: input.createdAt,
    outcomes: input.brief.outcomes ?? [],
    sections: input.draft.sections.map(section => {
      const sectionBrief = briefById.get(section.sectionId);
      if (!sectionBrief) {
        throw new Error(`Missing brief for ${section.sectionId}.`);
      }
      return {
        sectionId: section.sectionId,
        storyBeat: sectionBrief.storyBeat,
        sectionJob: sectionBrief.sectionJob,
        customerOutcome: sectionBrief.customerOutcome,
        control: section.control,
        candidate: {
          candidateId: section.candidateId,
          headline: section.headline,
          body: section.body,
          supportingText: section.supportingText,
          meaningTrace: section.meaningTrace,
          claimIds: section.claimIds,
          lineBindings: section.lineBindings,
          tasteTags: section.tasteTags,
        },
      };
    }),
    panel: input.reviews,
  };
}

export function createEmptyMarketingCopyTasteProfile(): MarketingCopyTasteProfile {
  return {
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    appliedDecisionIds: [],
    signals: Object.fromEntries(
      MARKETING_COPY_TASTE_TAGS.map(tag => [
        tag,
        { approved: 0, rejected: 0, edited: 0 },
      ])
    ) as Record<MarketingCopyTasteTag, MarketingCopyTasteSignal>,
  };
}

function assertMarketingCopyTasteProfile(
  profile: MarketingCopyTasteProfile
): void {
  if (profile.schemaVersion !== MARKETING_COPY_SPEC_VERSION) {
    throw new Error(
      `Unsupported marketing copy taste profile schema ${String(profile.schemaVersion)}.`
    );
  }
  if (!profile.signals || typeof profile.signals !== 'object') {
    throw new Error('Marketing copy taste profile signals are malformed.');
  }
  if (
    !Array.isArray(profile.appliedDecisionIds) ||
    profile.appliedDecisionIds.some(id => !isCanonicalTasteDecisionId(id)) ||
    new Set(profile.appliedDecisionIds.map(normalizeTasteDecisionId)).size !==
      profile.appliedDecisionIds.length
  ) {
    throw new Error(
      'Marketing copy taste profile decision receipts are malformed.'
    );
  }
  const signalRecord = profile.signals as Partial<
    Record<MarketingCopyTasteTag, MarketingCopyTasteSignal>
  >;
  const expectedTags = new Set<string>(MARKETING_COPY_TASTE_TAGS);
  if (
    Object.keys(profile.signals).some(tag => !expectedTags.has(tag)) ||
    Object.keys(profile.signals).length !== MARKETING_COPY_TASTE_TAGS.length
  ) {
    throw new Error(
      'Marketing copy taste profile tags do not match the schema.'
    );
  }
  for (const tag of MARKETING_COPY_TASTE_TAGS) {
    const signal = signalRecord[tag];
    if (
      !signal ||
      ![signal.approved, signal.rejected, signal.edited].every(
        count => Number.isSafeInteger(count) && count >= 0
      )
    ) {
      throw new Error(`Marketing copy taste signal ${tag} is malformed.`);
    }
  }
}

function normalizeTasteDecisionId(value: string): string {
  return value.trim().toLowerCase();
}

function isCanonicalTasteDecisionId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = normalizeTasteDecisionId(value);
  return (
    value === normalized && /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/.test(normalized)
  );
}

function assertMarketingCopyTasteInboxItem(
  item: MarketingCopyTasteInboxItem
): void {
  if (item.schemaVersion !== MARKETING_COPY_SPEC_VERSION) {
    throw new Error(
      `Unsupported marketing copy Taste Inbox schema ${String(item.schemaVersion)}.`
    );
  }
  for (const section of item.sections) {
    const tags = section.candidate.tasteTags;
    if (
      !Array.isArray(tags) ||
      tags.length === 0 ||
      tags.some(
        tag =>
          typeof tag !== 'string' ||
          !tag.trim() ||
          !MARKETING_COPY_TASTE_TAG_SET.has(tag)
      ) ||
      new Set(tags).size !== tags.length
    ) {
      throw new Error(
        `Taste Inbox candidate ${section.sectionId}/${section.candidate.candidateId} has malformed taste tags.`
      );
    }
    const lineBindings = section.candidate.lineBindings ?? [];
    const lineIds = lineBindings.map(binding => binding.lineId);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new Error(
        `Taste Inbox candidate ${section.sectionId}/${section.candidate.candidateId} has duplicate line bindings.`
      );
    }
    const outcomeIds = new Set(item.outcomes.map(outcome => outcome.id));
    for (const binding of lineBindings) {
      if (binding.outcomeId && !outcomeIds.has(binding.outcomeId)) {
        throw new Error(
          `Taste Inbox candidate ${section.sectionId}/${section.candidate.candidateId} cites unknown outcome ${binding.outcomeId}.`
        );
      }
    }
  }
}

export function applyMarketingCopyTasteDecision(
  profile: MarketingCopyTasteProfile,
  item: MarketingCopyTasteInboxItem,
  decision: MarketingCopyTasteDecision
): MarketingCopyTasteProfile {
  assertMarketingCopyTasteProfile(profile);
  assertMarketingCopyTasteInboxItem(item);
  if (!isCanonicalTasteDecisionId(decision.decisionId)) {
    throw new Error(
      'Taste decisions require a canonical lowercase stable decision ID.'
    );
  }
  const decisionId = normalizeTasteDecisionId(decision.decisionId);
  if (
    profile.appliedDecisionIds
      .map(normalizeTasteDecisionId)
      .includes(decisionId)
  ) {
    throw new Error(
      `Taste decision ${decision.decisionId} has already been applied.`
    );
  }
  if (!decision.reviewer.trim()) {
    throw new Error('Taste decisions require an authenticated reviewer ID.');
  }
  const decidedAt = new Date(decision.decidedAt);
  if (
    Number.isNaN(decidedAt.getTime()) ||
    decidedAt.toISOString() !== decision.decidedAt
  ) {
    throw new Error('Taste decisions require a valid decision timestamp.');
  }
  if (decision.sections.length === 0) {
    throw new Error('Taste decisions must include at least one section.');
  }

  const next = Object.fromEntries(
    MARKETING_COPY_TASTE_TAGS.map(tag => [
      tag,
      {
        approved: profile.signals[tag].approved,
        rejected: profile.signals[tag].rejected,
        edited: profile.signals[tag].edited,
      },
    ])
  ) as Record<MarketingCopyTasteTag, MarketingCopyTasteSignal>;
  const seen = new Set<string>();

  for (const sectionDecision of decision.sections) {
    const decisionKey = `${sectionDecision.sectionId}/${sectionDecision.candidateId}`;
    if (seen.has(decisionKey)) {
      throw new Error(`Duplicate taste decision for ${decisionKey}.`);
    }
    seen.add(decisionKey);
    const section = item.sections.find(
      candidate =>
        candidate.sectionId === sectionDecision.sectionId &&
        candidate.candidate.candidateId === sectionDecision.candidateId
    );
    if (!section) {
      throw new Error(
        `Taste decision references unknown candidate ${sectionDecision.sectionId}/${sectionDecision.candidateId}.`
      );
    }
    if (sectionDecision.outcome === 'edited') {
      if (!sectionDecision.editedCopy?.headline.trim()) {
        throw new Error(
          `Edited taste decision ${decisionKey} needs complete edited copy.`
        );
      }
      if (
        (section.candidate.body !== undefined &&
          typeof sectionDecision.editedCopy.body !== 'string') ||
        (section.candidate.supportingText !== undefined &&
          !Array.isArray(sectionDecision.editedCopy.supportingText))
      ) {
        throw new Error(
          `Edited taste decision ${decisionKey} must include the complete resulting visible copy.`
        );
      }
      if (
        normalizeMarketingCopyVisibleCopy(sectionDecision.editedCopy) ===
        normalizeMarketingCopyVisibleCopy(section.candidate)
      ) {
        throw new Error(
          `Edited taste decision ${decisionKey} must change visible copy.`
        );
      }
    } else if (sectionDecision.editedCopy) {
      throw new Error(
        `${sectionDecision.outcome} taste decision ${decisionKey} cannot include edited copy.`
      );
    }
    for (const tag of section.candidate.tasteTags) {
      if (!Number.isSafeInteger(next[tag][sectionDecision.outcome] + 1)) {
        throw new Error(`Marketing copy taste signal ${tag} would overflow.`);
      }
      next[tag] = {
        ...next[tag],
        [sectionDecision.outcome]: next[tag][sectionDecision.outcome] + 1,
      };
    }
  }

  return {
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    appliedDecisionIds: [...profile.appliedDecisionIds, decisionId],
    signals: next,
  };
}
