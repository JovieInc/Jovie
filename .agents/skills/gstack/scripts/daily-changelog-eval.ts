#!/usr/bin/env bun
/**
 * Daily changelog digest provenance evaluator (JOV-5762).
 *
 * Consumes `daily-changelog-source/v1` receipts — each joining an exact merge
 * SHA, Linear metadata, a successful Production Controller generation, an
 * immutable deployment identity, and a public build-info readback proving the
 * same SHA — and evaluates a proposed daily digest against them.
 *
 * Fail-closed contract:
 * - `merged`, `CI green`, and `deployed` are not synonyms for `available`; a
 *   source is eligible only when its public readback SHA equals its deployment
 *   SHA and its controller generation succeeded.
 * - Every eligible source is consumed by exactly one story, or carries a typed
 *   exclusion. An omitted eligible source is a failure (deliberate-red guard).
 * - `digest: null` is the only legal output for a no-change day; a digest with
 *   zero eligible sources is a vanity post and fails.
 * - Story copy may only restate approved claim IDs and numbers already present
 *   in approved source facts.
 */
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

export const DAILY_SOURCE_SCHEMA = 'daily-changelog-source/v1';
export const DAILY_EVAL_SCHEMA = 'daily-changelog-eval/v1';
export const DAILY_EVALUATOR_VERSION = '1';
export const FRESHNESS_SLA_MS = 25 * 60 * 60 * 1000;
export const MAX_BULLETS = 3;
export const EVAL_RETRY_BUDGET_MS = 45 * 60 * 1000; // 00:15Z evaluate, 01:00Z alert

export const TYPED_EXCLUSIONS = [
  'internal',
  'duplicate-outcome',
  'unavailable',
  'unsafe',
  'ambiguous',
  'failed-validation',
] as const;
export type TypedExclusion = (typeof TYPED_EXCLUSIONS)[number];

const GENERATION_STATUSES = [
  'succeeded',
  'draft',
  'prerelease',
  'failed',
  'superseded',
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export interface DailySourceReceipt {
  readonly schema?: string;
  readonly id: string;
  /** Exact merge SHA (40 hex). */
  readonly mergeSha: string;
  /** Canonical customer-outcome key; equal keys are duplicate outcomes. */
  readonly outcomeKey: string;
  readonly metadata?: {
    readonly issueId: string;
    readonly audience: string;
    readonly visibility: 'public' | 'internal';
    readonly releaseWorthy: boolean;
    readonly approvedClaimIds: readonly string[];
    /** Approved public fact text; the only entities/numbers copy may use. */
    readonly approvedFacts: readonly string[];
    readonly sourceLinks: readonly string[];
  };
  readonly controllerGeneration?: {
    readonly id: string;
    readonly status: GenerationStatus;
    readonly sha?: string;
  };
  readonly deployment?: { readonly id: string; readonly sha: string };
  /** Public build-info readback proving the deployed SHA is live. */
  readonly publicReadback?: { readonly sha: string; readonly firstPublicAt: string };
  /** Caller-declared typed exclusion (unsafe, ambiguous, duplicate-outcome…). */
  readonly exclusion?: TypedExclusion;
  readonly exclusionReason?: string;
}

export interface DailyStory {
  readonly id: string;
  readonly headline: string;
  readonly summary: string;
  readonly bullets: readonly string[];
  readonly claimIds: readonly string[];
  readonly sourceReceiptIds: readonly string[];
}

export interface DailyChangelogEvalInput {
  readonly schema: typeof DAILY_EVAL_SCHEMA;
  /** UTC window key `YYYY-MM-DD`; the window is [00:00:00Z, next 00:00:00Z). */
  readonly windowKey: string;
  readonly evaluatedAt: string;
  readonly sources: readonly DailySourceReceipt[];
  /** null emits a no-change receipt; never a vanity post. */
  readonly digest: { readonly stories: readonly DailyStory[] } | null;
}

export interface DailyEvalFinding {
  readonly rule: string;
  readonly message: string;
  readonly storyId?: string;
  readonly sourceId?: string;
}

export interface DailyEvalResult {
  readonly schema: typeof DAILY_EVAL_SCHEMA;
  readonly windowKey: string;
  /** Idempotency key: daily-changelog/YYYY-MM-DD@UTC */
  readonly idempotencyKey: string;
  /** Hash of sorted eligible source IDs plus evaluator version. */
  readonly contentKey: string;
  readonly evaluatorVersion: string;
  readonly evaluatedAt: string;
  readonly passed: boolean;
  readonly noChange: boolean;
  readonly eligibleSourceIds: readonly string[];
  readonly consumedSourceIds: readonly string[];
  readonly exclusions: readonly { readonly id: string; readonly reason: TypedExclusion }[];
  readonly lateArrivalSourceIds: readonly string[];
  readonly findings: readonly DailyEvalFinding[];
}

const SHA_RE = /^[0-9a-f]{40}$/;
const WINDOW_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function windowBounds(windowKey: string): { start: number; end: number } | null {
  if (!WINDOW_KEY_RE.test(windowKey)) return null;
  const start = Date.parse(`${windowKey}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const day = new Date(start);
  if (day.toISOString().slice(0, 10) !== windowKey) return null;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function sourceContractFailures(source: DailySourceReceipt): string[] {
  const failures: string[] = [];
  if (!isNonEmpty(source?.id)) failures.push('id');
  if (!isNonEmpty(source?.mergeSha) || !SHA_RE.test(source.mergeSha)) {
    failures.push('mergeSha');
  }
  if (!isNonEmpty(source?.outcomeKey)) failures.push('outcomeKey');
  const meta = source?.metadata;
  if (
    !meta ||
    !isNonEmpty(meta.issueId) ||
    !isNonEmpty(meta.audience) ||
    (meta.visibility !== 'public' && meta.visibility !== 'internal') ||
    typeof meta.releaseWorthy !== 'boolean' ||
    !Array.isArray(meta.approvedClaimIds) ||
    !Array.isArray(meta.approvedFacts) ||
    !Array.isArray(meta.sourceLinks)
  ) {
    failures.push('metadata');
  }
  const gen = source?.controllerGeneration;
  if (
    !gen ||
    !isNonEmpty(gen.id) ||
    !GENERATION_STATUSES.includes(gen.status) ||
    (gen.status === 'succeeded' && (!isNonEmpty(gen.sha) || !SHA_RE.test(gen.sha)))
  ) {
    failures.push('controllerGeneration');
  }
  const dep = source?.deployment;
  if (dep !== undefined && (!isNonEmpty(dep.id) || !SHA_RE.test(dep.sha))) {
    failures.push('deployment');
  }
  const rb = source?.publicReadback;
  if (
    rb !== undefined &&
    (!SHA_RE.test(rb.sha) || Number.isNaN(Date.parse(rb.firstPublicAt)))
  ) {
    failures.push('publicReadback');
  }
  if (
    source?.exclusion !== undefined &&
    !TYPED_EXCLUSIONS.includes(source.exclusion)
  ) {
    failures.push('exclusion');
  }
  return failures;
}

/**
 * Classify a contract-valid source: eligible for the public digest, or the
 * typed exclusion that keeps it out. `merged`/`deployed` alone never qualify —
 * eligibility requires a successful controller generation bound to an exact
 * deployment SHA and a public readback of the same SHA.
 */
function classifySource(source: DailySourceReceipt): TypedExclusion | null {
  if (source.exclusion) return source.exclusion;
  const meta = source.metadata!;
  if (meta.visibility === 'internal' || !meta.releaseWorthy) return 'internal';
  const gen = source.controllerGeneration!;
  if (gen.status !== 'succeeded') return 'unavailable';
  if (!source.deployment || source.deployment.sha !== gen.sha) {
    return 'unavailable';
  }
  if (
    !source.publicReadback ||
    source.publicReadback.sha !== source.deployment.sha
  ) {
    return 'unavailable';
  }
  return null;
}

function numbersIn(value: string): Set<string> {
  return new Set(value.match(NUMBER_RE) ?? []);
}

function addStoryFindings(
  input: DailyChangelogEvalInput,
  eligibleById: Map<string, DailySourceReceipt>,
  consumed: Map<string, string>,
  findings: DailyEvalFinding[]
): void {
  const stories = input.digest?.stories ?? [];
  const storyIds = new Set<string>();
  const outcomeToStories = new Map<string, Set<string>>();
  for (const [index, story] of stories.entries()) {
    const prefix = `Story ${index + 1}`;
    if (!isNonEmpty(story?.id) || !isNonEmpty(story?.headline) || !isNonEmpty(story?.summary)) {
      findings.push({ rule: 'story-contract', message: `${prefix} needs id, headline, and summary.` });
      continue;
    }
    if (storyIds.has(story.id)) {
      findings.push({ rule: 'duplicate-story-id', storyId: story.id, message: `Story ${story.id} appears more than once.` });
    }
    storyIds.add(story.id);
    if (!Array.isArray(story.bullets) || story.bullets.length > MAX_BULLETS) {
      findings.push({ rule: 'story-bullet-bound', storyId: story.id, message: `Story ${story.id} must have at most ${MAX_BULLETS} bullets.` });
    }
    if (!Array.isArray(story.sourceReceiptIds) || story.sourceReceiptIds.length === 0) {
      findings.push({ rule: 'story-without-source', storyId: story.id, message: `Story ${story.id} has no source receipts.` });
      continue;
    }
    const mappedSources: DailySourceReceipt[] = [];
    for (const sourceId of story.sourceReceiptIds) {
      const eligible = eligibleById.get(sourceId);
      if (!eligible) {
        findings.push({ rule: 'story-source-mismatch', storyId: story.id, sourceId, message: `Story ${story.id} references ${sourceId}, which is missing or excluded.` });
        continue;
      }
      if (consumed.has(sourceId)) {
        findings.push({ rule: 'duplicate-consumption', storyId: story.id, sourceId, message: `Source ${sourceId} is consumed by more than one story.` });
      }
      consumed.set(sourceId, story.id);
      mappedSources.push(eligible);
    }
    const approvedClaims = new Set(mappedSources.flatMap(s => s.metadata!.approvedClaimIds));
    for (const claimId of story.claimIds ?? []) {
      if (!approvedClaims.has(claimId)) {
        findings.push({ rule: 'unsupported-claim', storyId: story.id, message: `Story ${story.id} uses claim ${claimId}, which no mapped source approved.` });
      }
    }
    const approvedNumbers = new Set(
      mappedSources.flatMap(s => [...numbersIn(s.metadata!.approvedFacts.join(' '))])
    );
    const copy = [story.headline, story.summary, ...(story.bullets ?? [])].join(' ');
    for (const num of numbersIn(copy)) {
      if (!approvedNumbers.has(num)) {
        findings.push({ rule: 'unsupported-number', storyId: story.id, message: `Story ${story.id} states ${num}, which appears in no approved source fact.` });
      }
    }
    const outcomeKeys = new Set(mappedSources.map(s => s.outcomeKey));
    if (outcomeKeys.size > 1) {
      findings.push({ rule: 'false-merge', storyId: story.id, message: `Story ${story.id} merges different customer outcomes.` });
    }
    for (const key of outcomeKeys) {
      const set = outcomeToStories.get(key) ?? new Set<string>();
      set.add(story.id);
      outcomeToStories.set(key, set);
    }
  }
  for (const [key, ids] of outcomeToStories) {
    if (ids.size > 1) {
      findings.push({ rule: 'missed-squash', message: `Duplicate outcome ${key} is split across stories: ${[...ids].join(', ')}.` });
    }
  }
}

export function evaluateDailyChangelog(input: DailyChangelogEvalInput): DailyEvalResult {
  const findings: DailyEvalFinding[] = [];
  const sources = Array.isArray(input?.sources) ? input.sources : [];
  const evaluatedAt = isNonEmpty(input?.evaluatedAt) ? input.evaluatedAt : '';
  const evaluatedMs = Date.parse(evaluatedAt);
  const windowKey = isNonEmpty(input?.windowKey) ? input.windowKey : '';
  const bounds = windowBounds(windowKey);

  if (input?.schema !== DAILY_EVAL_SCHEMA) {
    findings.push({ rule: 'schema', message: `Expected schema ${DAILY_EVAL_SCHEMA}.` });
  }
  if (!bounds) {
    findings.push({ rule: 'window-contract', message: 'windowKey must be a valid YYYY-MM-DD UTC date.' });
  } else if (!Number.isNaN(evaluatedMs) && evaluatedMs < bounds.end) {
    findings.push({ rule: 'evaluation-before-window-close', message: `Window ${windowKey} cannot be evaluated before it closes at 00:00:00Z.` });
  }
  if (Number.isNaN(evaluatedMs)) {
    findings.push({ rule: 'evaluated-at-contract', message: 'evaluatedAt must be a valid ISO timestamp.' });
  }
  if (
    input?.digest !== null &&
    (typeof input?.digest !== 'object' || !Array.isArray(input.digest?.stories))
  ) {
    findings.push({ rule: 'digest-contract', message: 'digest must be null (no-change day) or { stories }.' });
  }

  const eligibleById = new Map<string, DailySourceReceipt>();
  const exclusions: { id: string; reason: TypedExclusion }[] = [];
  const seenIds = new Set<string>();
  for (const [index, source] of sources.entries()) {
    const prefix = `Source ${index + 1}`;
    const failures = sourceContractFailures(source);
    const id = isNonEmpty(source?.id) ? source.id : prefix;
    if (failures.length > 0) {
      findings.push({ rule: 'source-contract', sourceId: id, message: `${id} fails the source contract: ${failures.join(', ')}.` });
      exclusions.push({ id, reason: 'failed-validation' });
      continue;
    }
    if (seenIds.has(id)) {
      findings.push({ rule: 'duplicate-source-id', sourceId: id, message: `Source ${id} appears more than once.` });
      continue;
    }
    seenIds.add(id);
    const exclusion = classifySource(source);
    if (exclusion) {
      exclusions.push({ id, reason: exclusion });
    } else {
      eligibleById.set(id, source);
    }
  }

  const consumed = new Map<string, string>();
  if (input.digest?.stories) {
    addStoryFindings(input, eligibleById, consumed, findings);
  }
  for (const [id, source] of eligibleById) {
    if (!consumed.has(id)) {
      findings.push({ rule: 'omitted-eligible-source', sourceId: id, message: `Eligible source ${id} is not consumed by any story or typed exclusion.` });
      const ageMs = evaluatedMs - Date.parse(source.publicReadback!.firstPublicAt);
      if (!Number.isNaN(ageMs) && ageMs > FRESHNESS_SLA_MS) {
        findings.push({ rule: 'stale-unpublished-source', sourceId: id, message: `Eligible source ${id} has been publicly available for more than 25 hours without publication.` });
      }
    }
  }
  if (eligibleById.size > 0 && input.digest === null) {
    findings.push({ rule: 'digest-required', message: 'Eligible sources exist; a no-change digest would be a fabrication gap.' });
  }
  if (eligibleById.size === 0 && input.digest !== null && input.digest !== undefined) {
    findings.push({ rule: 'vanity-digest', message: 'No eligible sources; a no-change day must emit a receipt, not a post.' });
  }

  const eligibleIds = [...eligibleById.keys()].sort();
  const lateArrivalSourceIds = eligibleIds.filter(id => {
    const firstPublic = Date.parse(eligibleById.get(id)!.publicReadback!.firstPublicAt);
    return bounds !== null && firstPublic < bounds.start;
  });
  const contentKey = createHash('sha256')
    .update(JSON.stringify(eligibleIds))
    .update(DAILY_EVALUATOR_VERSION)
    .digest('hex');

  return {
    schema: DAILY_EVAL_SCHEMA,
    windowKey,
    idempotencyKey: `daily-changelog/${windowKey}@UTC`,
    contentKey,
    evaluatorVersion: DAILY_EVALUATOR_VERSION,
    evaluatedAt,
    passed: findings.length === 0,
    noChange: eligibleIds.length === 0,
    eligibleSourceIds: eligibleIds,
    consumedSourceIds: [...consumed.keys()].sort(),
    exclusions,
    lateArrivalSourceIds,
    findings,
  };
}

function runCli(): void {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: bun run scripts/daily-changelog-eval.ts <input.json> [--receipt <result.json>]'
    );
  }
  const receiptIndex = rest.indexOf('--receipt');
  const receiptPath = receiptIndex === -1 ? undefined : rest[receiptIndex + 1];
  const input = JSON.parse(
    fs.readFileSync(path.resolve(inputPath), 'utf8')
  ) as DailyChangelogEvalInput;
  const result = evaluateDailyChangelog(input);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (receiptPath) {
    const resolved = path.resolve(receiptPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (!result.passed) process.exitCode = 1;
}
if (import.meta.main) runCli();
