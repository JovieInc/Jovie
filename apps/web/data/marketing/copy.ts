import { lintCopy } from '@jovie/copy';
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
  /**
   * Concrete brief actions the rendered section must surface. Error and
   * onboarding states use this to guarantee a real recovery path, not just
   * an apologetic dead end.
   */
  readonly requiredActionIds?: readonly string[];
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

/**
 * Anti-slop signals come from @jovie/copy, the one executable rule set
 * (canon/VOICE.md). A truthful, outcome-bound line can still use most words;
 * the semantic audit above owns meaning.
 */
function auditCopyPatterns(
  sectionId: string,
  value: string,
  headline: boolean
): MarketingCopyAuditIssue[] {
  return lintCopy(value, {
    register: 'jovie-marketing',
    headline,
  }).blocking.map(finding => ({
    code: finding.rule,
    sectionId,
    message: `${finding.message} Found in: "${value}"`,
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

/**
 * Rendered-copy verification (JOV-6478).
 *
 * The registry audits above certify the *reviewed* words. This layer binds
 * the certified candidate to the text a surface actually renders: a registry
 * pass must never certify a route that renders different words or promises
 * the allowed claims cannot support.
 *
 * A rendered surface is the exact, ordered set of visible lines captured from
 * one route or UI state at one source version. Certification fingerprints the
 * reviewed brief+draft digest together with the rendered text, so a changed
 * claim, evidence revision, or rendered output invalidates prior receipts.
 */

export interface RenderedCopyLine {
  /** Matches the reviewed draft's visible line id (`headline`, `body`, `supporting:N`). */
  readonly lineId: string;
  readonly role: MarketingCopyLineRole;
  /** Exact text as rendered to the visitor. */
  readonly value: string;
}

export interface RenderedCopySection {
  readonly sectionId: string;
  readonly lines: readonly RenderedCopyLine[];
}

/**
 * Exact rendered text for one route or UI state. `sourceVersion` is the
 * deployed commit/build identity the capture was taken at; `state` names the
 * runtime state when a route has several (e.g. `default`, `error`).
 */
export interface RenderedCopySurface {
  readonly surfaceId: string;
  readonly pageId: string;
  readonly route: string;
  readonly state: string;
  readonly sourceVersion: string;
  readonly sections: readonly RenderedCopySection[];
}

/**
 * A taste-approved divergence between reviewed candidate copy and rendered
 * text (e.g. a legally required line, or intentionally terse chrome). The
 * exception only applies when the rendered value matches `value` exactly;
 * it never excuses an unsupported claim.
 */
export interface RenderedCopyApprovedException {
  readonly sectionId: string;
  readonly lineId: string;
  readonly value: string;
  readonly approvedBy: string;
  readonly reference: string;
}

/** Fingerprint of the exact rendered surface text at one source version. */
export function createRenderedCopyDigest(surface: RenderedCopySurface): string {
  const canonical = JSON.stringify({
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    surfaceId: surface.surfaceId,
    pageId: surface.pageId,
    route: surface.route,
    state: surface.state,
    sourceVersion: surface.sourceVersion,
    sections: surface.sections.map(section => ({
      sectionId: section.sectionId,
      lines: section.lines.map(line => ({
        lineId: line.lineId,
        role: line.role,
        value: line.value,
      })),
    })),
  });
  return `rendered-copy/${MARKETING_COPY_SPEC_VERSION}/sha256/${bytesToHex(
    sha256(new TextEncoder().encode(canonical))
  )}`;
}

/**
 * Quantitative and availability tokens are the mechanically checkable part of
 * product truth: a rendered price, limit, count, or availability word must
 * appear verbatim in the section's allowed claim corpus (statement +
 * evidence). Anything else is an unsupported promise, including invented
 * success numbers ("10,000 artists") and repriced offers.
 */
const RENDERED_MONEY_PATTERN = /[$€£]\s?(\d[\d,]*(?:\.\d{1,2})?)/g;
const RENDERED_PERCENT_PATTERN = /\b(\d[\d,]*(?:\.\d+)?)\s?%/g;
const RENDERED_QUANTITY_PATTERN =
  /\b(\d[\d,]*(?:\.\d+)?)\s?(?:x|times|days?|weeks?|months?|years?|hours?|minutes?|artists?|fans?|users?|members?|downloads?|streams?|emails?|credits?|seats?)\b/gi;
const RENDERED_AVAILABILITY_TERMS = [
  'free',
  'trial',
  'unlimited',
  'guarantee',
  'guaranteed',
  'refund',
  'lifetime',
  'forever',
  'no credit card',
] as const;
const RENDERED_ERROR_PATTERN =
  /\b(?:went wrong|error|failed|failure|unavailable|timed out|cannot continue|try again)\b/i;

function renderedQuantityTokens(value: string): string[] {
  const tokens: string[] = [];
  for (const pattern of [
    RENDERED_MONEY_PATTERN,
    RENDERED_PERCENT_PATTERN,
    RENDERED_QUANTITY_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(value);
    while (match) {
      tokens.push((match[1] ?? '').replaceAll(',', ''));
      match = pattern.exec(value);
    }
  }
  return tokens.filter(token => token.length > 0);
}

function claimCorpusWords(
  brief: MarketingCopyPageBrief,
  sectionBrief: MarketingCopySectionBrief | undefined
): Set<string> {
  const allowed = new Set(sectionBrief?.allowedClaimIds ?? []);
  const corpus = new Set<string>();
  for (const claim of brief.claims) {
    if (!allowed.has(claim.id)) continue;
    for (const word of words(claim.statement)) corpus.add(word);
    for (const evidence of claim.evidence) {
      for (const word of words(evidence)) corpus.add(word);
    }
  }
  return corpus;
}

function claimCorpusText(
  brief: MarketingCopyPageBrief,
  sectionBrief: MarketingCopySectionBrief | undefined
): string {
  const allowed = new Set(sectionBrief?.allowedClaimIds ?? []);
  const parts: string[] = [];
  for (const claim of brief.claims) {
    if (!allowed.has(claim.id)) continue;
    parts.push(claim.statement, ...claim.evidence);
  }
  return normalizeText(parts.join(' '));
}

export interface RenderedCopyAuditOptions {
  readonly exceptions?: readonly RenderedCopyApprovedException[];
}

/**
 * Compares the exact rendered surface against the reviewed draft and the
 * allowed claim registry. Registry-only approval is not certification: any
 * line that renders differently, promises unsupported availability or
 * pricing, or drops a required recovery action is an issue.
 */
export function auditRenderedMarketingCopy(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  surface: RenderedCopySurface,
  options: RenderedCopyAuditOptions = {}
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  const exceptions = options.exceptions ?? [];
  const appliedExceptions = new Set<number>();

  if (
    surface.pageId !== brief.pageId ||
    surface.pageId !== draft.pageId ||
    surface.route !== brief.route ||
    surface.route !== draft.route ||
    !surface.surfaceId.trim() ||
    !surface.state.trim() ||
    !surface.sourceVersion.trim()
  ) {
    issues.push(
      issue(
        'rendered-surface-mismatch',
        undefined,
        `Rendered surface ${surface.surfaceId || '(unnamed)'} must identify the same page and route as the reviewed brief and draft, with a state and source version.`
      )
    );
  }

  const briefSections = new Map(
    brief.sections.map(section => [section.sectionId, section])
  );
  const draftSections = new Map(
    draft.sections.map(section => [section.sectionId, section])
  );
  const renderedSections = new Map(
    surface.sections.map(section => [section.sectionId, section])
  );
  const actionsById = new Map(
    (brief.actions ?? []).map(action => [action.id, action])
  );

  for (const rendered of surface.sections) {
    if (!draftSections.has(rendered.sectionId)) {
      issues.push(
        issue(
          'unexpected-rendered-section',
          rendered.sectionId,
          `Rendered section ${rendered.sectionId} has no reviewed draft section.`
        )
      );
    }
  }

  for (const [index, exception] of exceptions.entries()) {
    const renderedSection = renderedSections.get(exception.sectionId);
    const renderedLine = renderedSection?.lines.find(
      line => line.lineId === exception.lineId
    );
    if (
      !exception.sectionId.trim() ||
      !exception.lineId.trim() ||
      !exception.value.trim() ||
      !exception.approvedBy.trim() ||
      !exception.reference.trim() ||
      !renderedLine
    ) {
      issues.push(
        issue(
          'stale-approved-exception',
          exception.sectionId || undefined,
          `Approved exception ${exception.reference || exception.lineId} does not resolve to a rendered line.`
        )
      );
      continue;
    }
    if (normalizeText(renderedLine.value) === normalizeText(exception.value)) {
      appliedExceptions.add(index);
    }
  }

  for (const section of draft.sections) {
    const rendered = renderedSections.get(section.sectionId);
    if (!rendered) {
      issues.push(
        issue(
          'missing-rendered-section',
          section.sectionId,
          `Reviewed section ${section.sectionId} produced no rendered copy.`
        )
      );
      continue;
    }

    const expected = visibleLines(section);
    const expectedIds = new Set(expected.map(line => line.lineId));
    const renderedById = new Map<string, RenderedCopyLine>();
    for (const line of rendered.lines) {
      if (renderedById.has(line.lineId)) {
        issues.push(
          issue(
            'duplicate-rendered-line',
            section.sectionId,
            `Rendered line ${line.lineId} appears more than once.`
          )
        );
      }
      renderedById.set(line.lineId, line);
    }

    const exceptionFor = (lineId: string, renderedValue: string): boolean =>
      exceptions.some((exception, exceptionIndex) => {
        if (
          exception.sectionId !== section.sectionId ||
          exception.lineId !== lineId ||
          normalizeText(exception.value) !== normalizeText(renderedValue)
        ) {
          return false;
        }
        appliedExceptions.add(exceptionIndex);
        return true;
      });

    for (const line of rendered.lines) {
      if (!expectedIds.has(line.lineId)) {
        if (!exceptionFor(line.lineId, line.value)) {
          issues.push(
            issue(
              'unbound-rendered-line',
              section.sectionId,
              `Rendered ${line.role} line ${line.lineId} has no reviewed draft line: "${line.value}".`
            )
          );
        }
      }
    }

    for (const line of expected) {
      const renderedLine = renderedById.get(line.lineId);
      if (!renderedLine) {
        issues.push(
          issue(
            'missing-rendered-line',
            section.sectionId,
            `Reviewed ${line.role} line ${line.lineId} is not rendered: "${line.value}".`
          )
        );
        continue;
      }
      if (renderedLine.role !== line.role) {
        issues.push(
          issue(
            'rendered-line-role-mismatch',
            section.sectionId,
            `Rendered line ${line.lineId} uses role ${renderedLine.role} but was reviewed as ${line.role}.`
          )
        );
      }
      if (normalizeText(renderedLine.value) !== normalizeText(line.value)) {
        if (!exceptionFor(line.lineId, renderedLine.value)) {
          issues.push(
            issue(
              'rendered-text-mismatch',
              section.sectionId,
              `Rendered ${line.role} differs from the reviewed words: "${renderedLine.value}" vs "${line.value}".`
            )
          );
        }
      }
    }

    const sectionBrief = briefSections.get(section.sectionId);
    const corpusWords = claimCorpusWords(brief, sectionBrief);
    const corpusText = ` ${claimCorpusText(brief, sectionBrief)} `;

    for (const line of rendered.lines) {
      for (const token of renderedQuantityTokens(line.value)) {
        if (!corpusWords.has(token)) {
          issues.push(
            issue(
              'unsupported-rendered-claim',
              section.sectionId,
              `Rendered ${line.role} asserts an unsupported quantity "${token}" in "${line.value}".`
            )
          );
        }
      }
      const normalizedLine = ` ${normalizeText(line.value)} `;
      for (const term of RENDERED_AVAILABILITY_TERMS) {
        if (
          normalizedLine.includes(` ${normalizeText(term)} `) &&
          !corpusText.includes(` ${normalizeText(term)} `)
        ) {
          issues.push(
            issue(
              'unsupported-rendered-claim',
              section.sectionId,
              `Rendered ${line.role} asserts unsupported availability "${term}" in "${line.value}".`
            )
          );
        }
      }
    }

    const bindings = section.lineBindings ?? [];
    const boundActionLineIds = new Set(
      bindings
        .filter(
          binding => binding.actionId && actionsById.has(binding.actionId)
        )
        .map(binding => binding.lineId)
    );
    for (const actionId of sectionBrief?.requiredActionIds ?? []) {
      if (!actionsById.has(actionId)) {
        issues.push(
          issue(
            'unknown-required-action',
            section.sectionId,
            `Section requires unknown action ${actionId}.`
          )
        );
        continue;
      }
      const bound = bindings.filter(binding => binding.actionId === actionId);
      if (bound.length === 0) {
        issues.push(
          issue(
            'missing-recovery-action',
            section.sectionId,
            `Required action ${actionId} is not bound to any reviewed line.`
          )
        );
        continue;
      }
      for (const binding of bound) {
        const renderedLine = renderedById.get(binding.lineId);
        if (!renderedLine || !renderedLine.value.trim()) {
          issues.push(
            issue(
              'missing-recovery-action',
              section.sectionId,
              `Required action ${actionId} is not rendered; there is no concrete recovery path.`
            )
          );
        }
      }
    }
    if (
      boundActionLineIds.size === 0 &&
      rendered.lines.some(line => RENDERED_ERROR_PATTERN.test(line.value))
    ) {
      issues.push(
        issue(
          'missing-recovery-action',
          section.sectionId,
          'An error-facing section renders no concrete action for the reader.'
        )
      );
    }
  }
  return issues;
}

/**
 * Certification record: the exact route/state, source version, reviewed-text
 * digest, and rendered-text digest this surface was verified at. Any change
 * to the claim registry, reviewed candidate, rendered output, or deployed
 * source version makes the receipt stale.
 */
export interface RenderedCopyCertification {
  readonly schemaVersion: typeof MARKETING_COPY_SPEC_VERSION;
  readonly kind: 'rendered-marketing-copy';
  readonly surfaceId: string;
  readonly pageId: string;
  readonly route: string;
  readonly state: string;
  readonly sourceVersion: string;
  readonly reviewDigest: string;
  readonly renderedDigest: string;
  readonly certifiedAt: string;
  readonly reviews: readonly {
    readonly role: MarketingCopyReviewRole;
    readonly reviewerId: string;
    readonly provider: string;
    readonly model: string;
    readonly executionId: string;
  }[];
  readonly exceptions: readonly RenderedCopyApprovedException[];
}

export interface RenderedCopyCertificationInput {
  readonly brief: MarketingCopyPageBrief;
  readonly draft: MarketingCopyPageDraft;
  readonly surface: RenderedCopySurface;
  readonly reviews?: readonly MarketingCopyPanelReview[];
  readonly exceptions?: readonly RenderedCopyApprovedException[];
  readonly certifiedAt: string;
}

/**
 * Runs the full chain — structural audit, delta semantic audit, the
 * independent panel when receipts are supplied, and the rendered-text audit —
 * then issues a certification bound to the exact rendered words. Throws when
 * any layer reports an issue; a registry-only pass cannot certify.
 */
export function createRenderedCopyCertification(
  input: RenderedCopyCertificationInput
): RenderedCopyCertification {
  const issues = [
    ...auditMarketingCopyPage(input.brief, input.draft),
    ...auditMarketingCopySemantics(input.brief, input.draft, {
      enforcement: 'delta',
    }).issues,
    ...(input.reviews
      ? auditMarketingCopyPanel(input.reviews, input.brief, input.draft)
      : []),
    ...auditRenderedMarketingCopy(input.brief, input.draft, input.surface, {
      exceptions: input.exceptions,
    }),
  ];
  if (issues.length > 0) {
    throw new Error(
      `Rendered copy cannot be certified:\n${issues.map(issue => `- ${issue.code}: ${issue.message}`).join('\n')}`
    );
  }
  const certifiedAt = new Date(input.certifiedAt);
  if (
    Number.isNaN(certifiedAt.getTime()) ||
    certifiedAt.toISOString() !== input.certifiedAt
  ) {
    throw new Error('Rendered copy certification requires a valid timestamp.');
  }
  return {
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    kind: 'rendered-marketing-copy',
    surfaceId: input.surface.surfaceId,
    pageId: input.surface.pageId,
    route: input.surface.route,
    state: input.surface.state,
    sourceVersion: input.surface.sourceVersion,
    reviewDigest: createMarketingCopyReviewDigest(input.brief, input.draft),
    renderedDigest: createRenderedCopyDigest(input.surface),
    certifiedAt: input.certifiedAt,
    reviews: (input.reviews ?? []).map(review => ({
      role: review.role,
      reviewerId: review.reviewerId,
      provider: review.provider,
      model: review.model,
      executionId: review.executionId,
    })),
    exceptions: input.exceptions ?? [],
  };
}

/**
 * Re-checks a stored certification against the current brief, draft, and
 * rendered surface. Changed reviewed words, changed rendered output, or a
 * different deployed source version each invalidate the receipt.
 */
export function auditRenderedCopyCertification(
  certification: RenderedCopyCertification,
  input: {
    readonly brief: MarketingCopyPageBrief;
    readonly draft: MarketingCopyPageDraft;
    readonly surface: RenderedCopySurface;
  }
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  const { brief, draft, surface } = input;
  if (
    certification.schemaVersion !== MARKETING_COPY_SPEC_VERSION ||
    certification.kind !== 'rendered-marketing-copy'
  ) {
    issues.push(
      issue(
        'unsupported-certification',
        undefined,
        'The rendered copy certification has an unknown schema or kind.'
      )
    );
  }
  if (
    certification.surfaceId !== surface.surfaceId ||
    certification.pageId !== brief.pageId ||
    certification.pageId !== draft.pageId ||
    certification.route !== surface.route ||
    certification.state !== surface.state
  ) {
    issues.push(
      issue(
        'certification-target-mismatch',
        undefined,
        'The certification does not identify this surface, route, and state.'
      )
    );
  }
  if (certification.sourceVersion !== surface.sourceVersion) {
    issues.push(
      issue(
        'stale-source-version',
        undefined,
        `Certified at source ${certification.sourceVersion} but the surface reports ${surface.sourceVersion}.`
      )
    );
  }
  if (
    certification.reviewDigest !== createMarketingCopyReviewDigest(brief, draft)
  ) {
    issues.push(
      issue(
        'stale-review-digest',
        undefined,
        'The reviewed brief or candidate changed after certification.'
      )
    );
  }
  if (certification.renderedDigest !== createRenderedCopyDigest(surface)) {
    issues.push(
      issue(
        'stale-rendered-copy',
        undefined,
        'The rendered text changed after certification.'
      )
    );
  }
  return issues;
}
