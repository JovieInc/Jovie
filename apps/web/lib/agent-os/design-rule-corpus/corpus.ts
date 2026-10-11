import {
  type AdversarialHardeningRecord,
  AdversarialHardeningRecordSchema,
  DESIGN_RULE_CORPUS_SCHEMA,
  type DesignRule,
  type DesignRuleCandidate,
  DesignRuleCandidateSchema,
  type DesignRuleClass,
  type DesignRuleCorpus,
  DesignRuleCorpusSchema,
  type DesignRuleDomain,
  type DesignRuleRoute,
  type DesignRuleStatus,
  type FounderRuleDecision,
  FounderRuleDecisionRecordSchema,
} from './types';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'in',
  'is',
  'it',
  'its',
  'must',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'their',
  'to',
  'unless',
  'when',
  'with',
]);

/** Normalizes a statement into a lowercase dedupe signature. */
export function normalizeRuleStatement(statement: string): string {
  return statement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token))
    .join(' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeRuleStatement(text).split(' '));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

const DUPLICATE_THRESHOLD = 0.8;

const NEGATION_TOKENS = new Set([
  'never',
  'no',
  'not',
  'avoid',
  'prohibited',
  'without',
]);

export function createDesignRuleCorpus(now: string): DesignRuleCorpus {
  return {
    schema: DESIGN_RULE_CORPUS_SCHEMA,
    rules: {},
    updatedAt: now,
  };
}

export function parseDesignRuleCorpus(raw: unknown): DesignRuleCorpus {
  return DesignRuleCorpusSchema.parse(raw);
}

export function serializeDesignRuleCorpus(corpus: DesignRuleCorpus): string {
  return JSON.stringify(parseDesignRuleCorpus(corpus));
}

export interface IngestResult {
  readonly corpus: DesignRuleCorpus;
  readonly added: readonly string[];
  /** Candidate ids skipped because an equivalent rule already exists. */
  readonly duplicates: readonly {
    readonly candidateId: string;
    readonly coveredById: string;
  }[];
}

/**
 * Finds an existing rule that already covers a candidate statement: exact
 * signature match or high token-overlap similarity within the same domain.
 */
export function findCoveringRule(
  corpus: DesignRuleCorpus,
  candidate: Pick<DesignRuleCandidate, 'statement' | 'domain'>
): DesignRule | null {
  const signature = normalizeRuleStatement(candidate.statement);
  const tokens = new Set(signature.split(' '));
  let best: { rule: DesignRule; score: number } | null = null;
  for (const rule of Object.values(corpus.rules)) {
    if (rule.domain !== candidate.domain) continue;
    const ruleSignature = normalizeRuleStatement(
      rule.founderDecision?.modifiedStatement ?? rule.normalizedStatement
    );
    if (ruleSignature === signature) return rule;
    const score = jaccard(tokens, new Set(ruleSignature.split(' ')));
    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { rule, score };
    }
  }
  return best?.rule ?? null;
}

/**
 * Ingests mined candidates into the corpus. Semantically equivalent
 * candidates are skipped as duplicates; nothing becomes policy here —
 * every ingested rule starts as `candidate` awaiting a founder decision.
 */
export function ingestRuleCandidates(
  corpus: DesignRuleCorpus,
  candidates: readonly DesignRuleCandidate[]
): IngestResult {
  let next = corpus;
  const added: string[] = [];
  const duplicates: IngestResult['duplicates'][number][] = [];
  for (const raw of candidates) {
    const candidate = DesignRuleCandidateSchema.parse(raw);
    if (next.rules[candidate.id]) {
      throw new Error(`Design rule ${candidate.id} already exists.`);
    }
    const covering = findCoveringRule(next, candidate);
    if (covering) {
      duplicates.push({ candidateId: candidate.id, coveredById: covering.id });
      continue;
    }
    const rule: DesignRule = {
      ...candidate,
      normalizedStatement:
        candidate.normalizedStatement ??
        normalizeRuleStatement(candidate.statement),
      status: 'candidate',
      founderDecision: null,
      hardening: null,
      activeClass: null,
      route: null,
      decidedAt: null,
      promotedAt: null,
    };
    next = {
      ...next,
      rules: { ...next.rules, [rule.id]: rule },
      updatedAt: candidate.proposedAt,
    };
    added.push(rule.id);
  }
  return { corpus: next, added, duplicates };
}

export interface RuleConflict {
  readonly leftId: string;
  readonly rightId: string;
  readonly reason: 'declared' | 'negation-overlap';
}

function hasNegation(tokens: Set<string>): boolean {
  return [...tokens].some(t => NEGATION_TOKENS.has(t));
}

function detectNegationOverlaps(rules: DesignRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  for (let i = 0; i < rules.length; i += 1) {
    const left = rules[i];
    const leftTokens = tokenSet(left.normalizedStatement);
    for (let j = i + 1; j < rules.length; j += 1) {
      const right = rules[j];
      if (
        left.domain !== right.domain ||
        left.hierarchyLevel !== right.hierarchyLevel
      ) {
        continue;
      }
      const rightTokens = tokenSet(right.normalizedStatement);
      if (jaccard(leftTokens, rightTokens) < 0.5) continue;
      if (hasNegation(leftTokens) !== hasNegation(rightTokens)) {
        conflicts.push({
          leftId: left.id,
          rightId: right.id,
          reason: 'negation-overlap',
        });
      }
    }
  }
  return conflicts;
}

/**
 * Detects contradictions between candidates instead of silently merging
 * them: explicit conflictingRuleIds links, plus same-domain rules whose
 * statements overlap heavily but differ in negation polarity.
 */
export function detectRuleConflicts(
  corpus: DesignRuleCorpus
): readonly RuleConflict[] {
  const rules = Object.values(corpus.rules);
  const conflicts: RuleConflict[] = [];
  const seen = new Set<string>();
  const push = (conflict: RuleConflict) => {
    const key = [conflict.leftId, conflict.rightId]
      .sort((a, b) => a.localeCompare(b))
      .join('|');
    if (!seen.has(key)) {
      seen.add(key);
      conflicts.push(conflict);
    }
  };
  for (const rule of rules) {
    for (const otherId of rule.conflictingRuleIds) {
      if (corpus.rules[otherId]) {
        push({ leftId: rule.id, rightId: otherId, reason: 'declared' });
      }
    }
  }
  for (const conflict of detectNegationOverlaps(rules)) {
    push(conflict);
  }
  return conflicts;
}

/** Review priority: leverage × fanout × confidence × novelty. */
export function ruleReviewScore(
  rule: Pick<DesignRule, 'leverage' | 'fanout' | 'confidence' | 'novelty'>
): number {
  return rule.leverage * rule.fanout * rule.confidence * rule.novelty;
}

export interface FounderRuleReviewItem {
  readonly id: string;
  readonly statement: string;
  readonly domain: DesignRuleDomain;
  readonly proposedClass: DesignRuleClass;
  readonly score: number;
  readonly prompt: string;
}

/**
 * Phase A rapid-intake queue: undecided candidates ranked by expected
 * leverage so the founder sees the highest-signal rules first. Prompts are
 * deliberately concise for voice review.
 */
export function buildFounderRuleReviewQueue(
  corpus: DesignRuleCorpus
): readonly FounderRuleReviewItem[] {
  return Object.values(corpus.rules)
    .filter(rule => rule.status === 'candidate')
    .map(rule => ({
      id: rule.id,
      statement: rule.statement,
      domain: rule.domain,
      proposedClass: rule.proposedClass,
      score: ruleReviewScore(rule),
      prompt: `${rule.statement} Accept, reject, modify, contextual, or already covered?`,
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id)
    );
}

function assertDecisionRequirements(
  parsed: ReturnType<typeof FounderRuleDecisionRecordSchema.parse>
): void {
  if (parsed.decision === 'modify' && !parsed.modifiedStatement) {
    throw new Error(
      `Founder decision ${parsed.id} is modify and requires modifiedStatement.`
    );
  }
  if (parsed.decision === 'contextual' && !parsed.contextClauses?.length) {
    throw new Error(
      `Founder decision ${parsed.id} is contextual and requires contextClauses.`
    );
  }
  if (parsed.decision === 'already-covered' && !parsed.coveredById) {
    throw new Error(
      `Founder decision ${parsed.id} is already-covered and requires coveredById.`
    );
  }
}

function statusForRuleDecision(
  decision: FounderRuleDecision
): DesignRuleStatus {
  switch (decision) {
    case 'accept':
    case 'modify':
      return 'accepted';
    case 'reject':
      return 'rejected';
    case 'contextual':
      return 'contextualized';
    case 'already-covered':
      return 'covered';
  }
}

/**
 * Records a Phase A founder decision. Rejections are durable negative
 * evidence; accepted/contextual rules remain unactivated until Phase B
 * adversarial hardening promotes them.
 */
export function recordFounderRuleDecision(
  corpus: DesignRuleCorpus,
  ruleId: string,
  decision: {
    readonly id: string;
    readonly decision: FounderRuleDecision;
    readonly reviewer: string;
    readonly verbatimRationale: string;
    readonly normalizedRationale?: string | null;
    readonly modifiedStatement?: string | null;
    readonly contextClauses?: readonly string[] | null;
    readonly coveredById?: string | null;
    readonly decidedAt: string;
  }
): DesignRuleCorpus {
  const rule = corpus.rules[ruleId];
  if (!rule) throw new Error(`Unknown design rule ${ruleId}.`);
  if (rule.status !== 'candidate') {
    throw new Error(
      `Design rule ${ruleId} already has a founder decision (status: ${rule.status}).`
    );
  }
  const parsed = FounderRuleDecisionRecordSchema.parse({
    ...decision,
    normalizedRationale: decision.normalizedRationale ?? null,
    modifiedStatement: decision.modifiedStatement ?? null,
    contextClauses: decision.contextClauses ?? null,
    coveredById: decision.coveredById ?? null,
  });
  assertDecisionRequirements(parsed);
  if (parsed.coveredById && !corpus.rules[parsed.coveredById]) {
    throw new Error(
      `Founder decision ${parsed.id} cites unknown covering rule ${parsed.coveredById}.`
    );
  }
  const status = statusForRuleDecision(parsed.decision);
  const nextRule: DesignRule = {
    ...rule,
    statement: parsed.modifiedStatement ?? rule.statement,
    normalizedStatement: parsed.modifiedStatement
      ? normalizeRuleStatement(parsed.modifiedStatement)
      : rule.normalizedStatement,
    contexts:
      parsed.decision === 'contextual' && parsed.contextClauses
        ? [...rule.contexts, ...parsed.contextClauses]
        : rule.contexts,
    status,
    founderDecision: parsed,
    decidedAt: parsed.decidedAt,
    route: status === 'rejected' ? 'negative-evidence' : rule.route,
  };
  return {
    ...corpus,
    rules: { ...corpus.rules, [ruleId]: nextRule },
    updatedAt: parsed.decidedAt,
  };
}

/**
 * Phase B: records an adversarial hardening pass over representative
 * surfaces. A rule that predictably worsens an important surface cannot be
 * hardened as a hard invariant unchanged — it must be downgraded, given
 * exceptions, or rejected.
 */
export function recordAdversarialHardening(
  corpus: DesignRuleCorpus,
  ruleId: string,
  hardening: AdversarialHardeningRecord
): DesignRuleCorpus {
  const rule = corpus.rules[ruleId];
  if (!rule) throw new Error(`Unknown design rule ${ruleId}.`);
  if (rule.status !== 'accepted' && rule.status !== 'contextualized') {
    throw new Error(
      `Design rule ${ruleId} must be accepted or contextualized before hardening (status: ${rule.status}).`
    );
  }
  const parsed = AdversarialHardeningRecordSchema.parse(hardening);
  const worsened = parsed.evaluatedSurfaces.filter(s => s.verdict === 'worse');
  if (
    parsed.finalClass === 'hard-invariant' &&
    worsened.length > 0 &&
    parsed.addedExceptions.length === 0
  ) {
    throw new Error(
      `Rule ${ruleId} worsens ${worsened.length} surface(s); it cannot harden as a hard invariant without added exceptions, a downgrade, or rejection.`
    );
  }
  const nextRule: DesignRule = {
    ...rule,
    exceptions: [...rule.exceptions, ...parsed.addedExceptions],
    status: 'hardened',
    hardening: parsed,
    activeClass: parsed.finalClass,
  };
  return {
    ...corpus,
    rules: { ...corpus.rules, [ruleId]: nextRule },
    updatedAt: parsed.hardenedAt,
  };
}

/** Maps a hardened rule's final class to its consuming system. */
export function routeForRuleClass(ruleClass: DesignRuleClass): DesignRuleRoute {
  switch (ruleClass) {
    case 'hard-invariant':
      return 'invariant-registry';
    case 'anti-pattern':
      return 'promotion-court-fixtures';
    case 'taste-preference':
      return 'reference-corpus';
    case 'strong-default':
    case 'contextual':
      return 'refinement-retrieval';
  }
}

/**
 * Promotes a hardened rule into its consuming system. Promotion is the
 * only path that makes a rule active — a bare founder `accept` during
 * intake never activates a rule by itself.
 */
export function promoteRule(
  corpus: DesignRuleCorpus,
  ruleId: string,
  now: string
): DesignRuleCorpus {
  const rule = corpus.rules[ruleId];
  if (!rule) throw new Error(`Unknown design rule ${ruleId}.`);
  if (rule.status !== 'hardened' || !rule.activeClass) {
    throw new Error(
      `Design rule ${ruleId} must pass adversarial hardening before promotion (status: ${rule.status}).`
    );
  }
  const nextRule: DesignRule = {
    ...rule,
    status: 'promoted',
    route: routeForRuleClass(rule.activeClass),
    promotedAt: now,
  };
  return {
    ...corpus,
    rules: { ...corpus.rules, [ruleId]: nextRule },
    updatedAt: now,
  };
}

export interface DesignRuleQuery {
  readonly status?: DesignRuleStatus;
  readonly domain?: DesignRuleDomain;
  readonly activeClass?: DesignRuleClass;
  readonly route?: DesignRuleRoute;
}

export function queryDesignRules(
  corpus: DesignRuleCorpus,
  query: DesignRuleQuery = {}
): readonly DesignRule[] {
  return Object.values(corpus.rules)
    .filter(rule => (query.status ? rule.status === query.status : true))
    .filter(rule => (query.domain ? rule.domain === query.domain : true))
    .filter(rule =>
      query.activeClass ? rule.activeClass === query.activeClass : true
    )
    .filter(rule => (query.route ? rule.route === query.route : true))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Durable negative preference evidence: rules the founder rejected, so
 * agents never re-propose them as candidates.
 */
export function negativePreferenceRules(
  corpus: DesignRuleCorpus
): readonly DesignRule[] {
  return queryDesignRules(corpus, { status: 'rejected' });
}
