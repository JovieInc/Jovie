import 'server-only';
import { createHash } from 'node:crypto';
import { and, sql as drizzleSql, eq, gt, isNotNull } from 'drizzle-orm';
import {
  SCRIPT_LINES,
  type ScriptStepId,
} from '@/lib/chat/onboarding-script/script';
import { lintVoice } from '@/lib/chat/voice-lint';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { onboardingScriptLines } from '@/lib/db/schema/onboarding-script';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';
import {
  evaluatePromotionGate,
  type PromotionGateEvidence,
  type PromotionLineChange,
} from './promotion-gate';
import { mergedPromotionReceipts } from './promotion-receipts';

/**
 * Nightly self-improvement job for the deterministic onboarding script
 * (JOV-3806). Runs as a sub-job of /api/cron/daily-maintenance.
 *
 * 1. Mirror code seeds into onboarding_script_lines (insert-only).
 * 2. Recompute impressions/conversions per served line over a 90-day
 *    window (idempotent — no watermark).
 * 3. Mine candidate lines from LLM responses in onboarding conversations:
 *    PII-redacted, injection-screened (transcripts are untrusted input),
 *    lint-clean, generic-step only, seen in ≥5 converted conversations.
 *    Candidates are stored but NOT served.
 * 4. Promotions/reweights/retirements are emitted as a versioned promotion
 *    receipt and submitted through the PR machinery
 *    (apps/web/data/onboarding-script-promotions/). Only receipt changes
 *    that already merged — meaning the protected ci-promptfoo-evals lane
 *    went green on that head — are applied here, and only when the receipt's
 *    gate evidence (eval result + north-star cohort, JOV-7146) still holds
 *    against current stats.
 *
 * Conversion = the conversation was claimed onto a profile that finished
 * onboarding (creator_profiles.onboarding_completed_at). Attribution is
 * multi-touch: every line served in a converted conversation counts.
 */

const WINDOW_DAYS = 90;
export const MIN_CANDIDATE_CONVERSIONS = 5;
export const MIN_IMPRESSIONS_FOR_PROMOTION = 20;
export const PROMOTION_LIFT = 1.2;
export const MAX_NEW_CANDIDATES_PER_RUN = 5;
export const MIN_IMPRESSIONS_FOR_WEIGHT_ADJUST = 50;
export const RETIRE_FACTOR = 0.5;
const PROMOTED_INITIAL_WEIGHT = 20;
const MAX_LLM_ROWS = 5000;

/**
 * Steps whose copy is generic enough to reuse verbatim across visitors.
 * confirm_artist/handle interpolate artist-specific numbers and names —
 * promoting a concrete LLM response there would assert another artist's
 * stats to the wrong visitor.
 */
export const PROMOTABLE_STEPS: readonly ScriptStepId[] = [
  'greet',
  'get_artist',
  'ask_audience',
  'instant_access',
  'waitlist',
  'done',
];

interface ToolEventLike {
  readonly toolName?: unknown;
  readonly output?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Map an LLM assistant message's tool calls to the script step its text is
 * playing. Priority: the furthest-along action wins. Text-only turns return
 * null (v1 skips them — no step to attribute to).
 */
export function deriveStepFromToolEvents(
  toolCalls: unknown
): ScriptStepId | null {
  if (!Array.isArray(toolCalls)) return null;
  let step: ScriptStepId | null = null;
  const rank: Partial<Record<ScriptStepId, number>> = {
    get_artist: 1,
    ask_audience: 2,
    waitlist: 3,
    instant_access: 4,
  };
  const consider = (candidate: ScriptStepId) => {
    if (!step || (rank[candidate] ?? 0) > (rank[step] ?? 0)) {
      step = candidate;
    }
  };
  for (const raw of toolCalls) {
    const event = raw as ToolEventLike;
    const output = isRecord(event.output) ? event.output : null;
    const action = typeof output?.action === 'string' ? output.action : null;
    if (action === 'open_artist_picker') consider('get_artist');
    if (action === 'propose_checkout') consider('instant_access');
    if (action === 'propose_next_step') {
      const decision = isRecord(output?.decision) ? output.decision : null;
      if (decision?.kind === 'waitlist') consider('waitlist');
      if (decision?.kind === 'instant_access') consider('instant_access');
      if (decision?.kind === 'needs_more_info') consider('ask_audience');
    }
  }
  return step;
}

export interface LineStats {
  readonly impressions: number;
  readonly conversions: number;
}

function rate(stats: LineStats): number {
  return stats.impressions > 0 ? stats.conversions / stats.impressions : 0;
}

/** Statistical side of the promotion rule — pure, unit-tested. */
function statsClearPromotionBar(input: {
  readonly candidate: LineStats & { readonly text: string };
  readonly bestActive: LineStats | null;
}): boolean {
  const { candidate, bestActive } = input;
  if (!lintVoice(candidate.text).ok) return false;
  if (candidate.impressions < MIN_IMPRESSIONS_FOR_PROMOTION) return false;
  if (!bestActive || bestActive.impressions < MIN_IMPRESSIONS_FOR_PROMOTION) {
    // Not enough baseline volume to compare against — hold the candidate.
    return false;
  }
  return rate(candidate) >= rate(bestActive) * PROMOTION_LIFT;
}

/**
 * Promotion rule — pure, unit-tested. Requires a green protected
 * `ci-promptfoo-evals` result plus north-star cohort evidence (JOV-7148):
 * live copy never changes on stats alone.
 */
export function shouldPromoteCandidate(input: {
  readonly candidate: LineStats & { readonly text: string };
  readonly bestActive: LineStats | null;
  readonly gate: PromotionGateEvidence | null;
}): boolean {
  if (!evaluatePromotionGate(input.gate).ok) return false;
  return statsClearPromotionBar(input);
}

/** Statistical side of the weight rule — pure, unit-tested. */
function statsAdjustPromotedWeight(input: {
  readonly stats: LineStats;
  readonly bestSeedRate: number | null;
}): { readonly weight: number; readonly retire: boolean } | null {
  const { stats, bestSeedRate } = input;
  if (stats.impressions < MIN_IMPRESSIONS_FOR_WEIGHT_ADJUST) return null;
  if (bestSeedRate === null || bestSeedRate <= 0) return null;
  const lineRate = rate(stats);
  if (lineRate < bestSeedRate * RETIRE_FACTOR) {
    return { weight: 0, retire: true };
  }
  const weight = Math.min(
    150,
    Math.max(10, Math.round((100 * lineRate) / bestSeedRate))
  );
  return { weight, retire: false };
}

/**
 * Weight adjustment for active promoted lines — pure, unit-tested.
 * Same gate as promotion: protected eval green + north-star cohort evidence.
 */
export function adjustPromotedWeight(input: {
  readonly stats: LineStats;
  readonly bestSeedRate: number | null;
  readonly gate: PromotionGateEvidence | null;
}): { readonly weight: number; readonly retire: boolean } | null {
  if (!evaluatePromotionGate(input.gate).ok) return null;
  return statsAdjustPromotedWeight(input);
}

export function candidateLineKey(stepId: ScriptStepId, text: string): string {
  const digest = createHash('sha1').update(text).digest('hex').slice(0, 8);
  return `${stepId}:cand_${digest}`;
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

async function syncSeeds(): Promise<number> {
  const values = SCRIPT_LINES.map(line => ({
    lineKey: line.key,
    stepId: line.stepId,
    variant: line.variant,
    text: line.text,
    source: 'seed',
    status: 'active',
  }));
  const inserted = await db
    .insert(onboardingScriptLines)
    .values(values)
    .onConflictDoNothing({ target: onboardingScriptLines.lineKey })
    .returning({ id: onboardingScriptLines.id });
  return inserted.length;
}

async function recomputeServedCounters(): Promise<number> {
  const rows = await db
    .select({
      lineKey: chatMessages.scriptLineKey,
      impressions: drizzleSql<number>`count(distinct ${chatMessages.conversationId})`,
      conversions: drizzleSql<number>`count(distinct ${chatMessages.conversationId}) filter (where ${creatorProfiles.onboardingCompletedAt} is not null)`,
    })
    .from(chatMessages)
    .innerJoin(
      chatConversations,
      eq(chatMessages.conversationId, chatConversations.id)
    )
    .leftJoin(
      creatorProfiles,
      eq(chatConversations.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        isNotNull(chatMessages.scriptLineKey),
        gt(chatMessages.createdAt, windowStart())
      )
    )
    .groupBy(chatMessages.scriptLineKey);

  for (const row of rows) {
    if (!row.lineKey) continue;
    await db
      .update(onboardingScriptLines)
      .set({
        impressions: Number(row.impressions),
        conversions: Number(row.conversions),
        updatedAt: new Date(),
      })
      .where(eq(onboardingScriptLines.lineKey, row.lineKey));
  }
  return rows.length;
}

interface LlmMessageRow {
  readonly content: string;
  readonly toolCalls: unknown;
  readonly conversationId: string;
  readonly converted: boolean;
}

export interface CandidateStat {
  readonly stepId: ScriptStepId;
  readonly text: string;
  readonly impressions: number;
  readonly conversions: number;
}

const PII_PATTERNS: readonly [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [
    /\b(?:sk|pk|xox[baprs]|ghp|gho|glpat)-[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
    '[token]',
  ],
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]'],
];

/**
 * Transcript rows are untrusted input. PII is stripped before candidate
 * text is stored or counted, so mined lines can never smuggle a visitor's
 * contact details or leaked credentials into serving copy.
 */
export function redactTranscriptPii(text: string): string {
  return PII_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text
  ).replace(/\s{2,}/g, ' ');
}

/**
 * Instruction-shaped transcript text is rejected outright: transcript
 * content may inform which line we propose but must never steer tools,
 * policy, or carry markup that would be interpreted as instructions.
 */
export function containsInstructionVector(text: string): boolean {
  return /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts)|<\s*\/?\s*(system|developer|assistant|tool_call|untrusted-source)|jv-prompt-canary|ONBOARDING_SYSTEM_PROMPT|reveal\s+(your|the)\s+(system|hidden)\s+(prompt|instructions)|```\s*(system|prompt)/i.test(
    text
  );
}

/** Group LLM responses into per-(step, text) stats — pure, unit-tested. */
export function aggregateLlmCandidates(
  rows: readonly LlmMessageRow[]
): CandidateStat[] {
  const byKey = new Map<
    string,
    {
      stepId: ScriptStepId;
      text: string;
      impressions: Set<string>;
      conversions: Set<string>;
    }
  >();
  for (const row of rows) {
    if (containsInstructionVector(row.content)) continue;
    const text = redactTranscriptPii(row.content.trim());
    if (text.length < 20 || text.length > 500) continue;
    const stepId = deriveStepFromToolEvents(row.toolCalls);
    if (!stepId || !PROMOTABLE_STEPS.includes(stepId)) continue;
    const key = `${stepId}\u0000${text}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { stepId, text, impressions: new Set(), conversions: new Set() };
      byKey.set(key, entry);
    }
    entry.impressions.add(row.conversationId);
    if (row.converted) entry.conversions.add(row.conversationId);
  }
  return Array.from(byKey.values())
    .map(entry => ({
      stepId: entry.stepId,
      text: entry.text,
      impressions: entry.impressions.size,
      conversions: entry.conversions.size,
    }))
    .filter(stat => stat.conversions >= MIN_CANDIDATE_CONVERSIONS)
    .sort((a, b) => b.conversions - a.conversions);
}

async function fetchLlmRows(): Promise<LlmMessageRow[]> {
  const rows = await db
    .select({
      content: chatMessages.content,
      toolCalls: chatMessages.toolCalls,
      conversationId: chatMessages.conversationId,
      converted: drizzleSql<boolean>`${creatorProfiles.onboardingCompletedAt} is not null`,
    })
    .from(chatMessages)
    .innerJoin(
      chatConversations,
      eq(chatMessages.conversationId, chatConversations.id)
    )
    .leftJoin(
      creatorProfiles,
      eq(chatConversations.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(chatMessages.assistantSource, 'llm'),
        gt(chatMessages.createdAt, windowStart())
      )
    )
    .limit(MAX_LLM_ROWS);
  return rows.map(row => ({ ...row, converted: Boolean(row.converted) }));
}

async function mineCandidates(): Promise<number> {
  const stats = aggregateLlmCandidates(await fetchLlmRows());
  if (stats.length === 0) return 0;

  const existing = await db
    .select({ lineKey: onboardingScriptLines.lineKey })
    .from(onboardingScriptLines);
  const existingKeys = new Set(existing.map(row => row.lineKey));

  let inserted = 0;
  for (const stat of stats) {
    if (inserted >= MAX_NEW_CANDIDATES_PER_RUN) break;
    if (!lintVoice(stat.text).ok) continue;
    const lineKey = candidateLineKey(stat.stepId, stat.text);
    if (existingKeys.has(lineKey)) continue;
    await db
      .insert(onboardingScriptLines)
      .values({
        lineKey,
        stepId: stat.stepId,
        variant: lineKey.split(':')[1] ?? 'cand',
        text: stat.text,
        source: 'promoted',
        status: 'candidate',
        weight: PROMOTED_INITIAL_WEIGHT,
        impressions: stat.impressions,
        conversions: stat.conversions,
      })
      .onConflictDoNothing({ target: onboardingScriptLines.lineKey });
    inserted += 1;
  }
  return inserted;
}

type ScriptLineRow = typeof onboardingScriptLines.$inferSelect;

interface StepGroup {
  readonly bestActive: LineStats | null;
  readonly bestSeedRate: number | null;
}

function groupRowsByStep(rows: readonly ScriptLineRow[]) {
  const byStep = new Map<string, ScriptLineRow[]>();
  for (const row of rows) {
    const group = byStep.get(row.stepId) ?? [];
    group.push(row);
    byStep.set(row.stepId, group);
  }
  return byStep;
}

function stepGroupStats(group: readonly ScriptLineRow[]): StepGroup {
  const active = group.filter(row => row.status === 'active');
  const bestActive = active
    .filter(row => row.impressions >= MIN_IMPRESSIONS_FOR_PROMOTION)
    .sort((a, b) => rate(b) - rate(a))[0];
  const qualifiedSeeds = active.filter(
    row =>
      row.source === 'seed' && row.impressions >= MIN_IMPRESSIONS_FOR_PROMOTION
  );
  return {
    bestActive: bestActive
      ? {
          impressions: bestActive.impressions,
          conversions: bestActive.conversions,
        }
      : null,
    bestSeedRate:
      qualifiedSeeds.length > 0
        ? Math.max(...qualifiedSeeds.map(row => rate(row)))
        : null,
  };
}

/**
 * Propose the promotion batch a PR would carry. Statistical rules only —
 * the emitted receipt records the gate evidence a reviewer must attach;
 * nothing here touches live rows.
 */
function planPromotionChanges(
  rows: readonly ScriptLineRow[]
): PromotionLineChange[] {
  const changes: PromotionLineChange[] = [];
  for (const [stepId, group] of groupRowsByStep(rows)) {
    const { bestActive, bestSeedRate } = stepGroupStats(group);
    for (const row of group) {
      if (row.status === 'candidate') {
        if (
          statsClearPromotionBar({
            candidate: {
              text: row.text,
              impressions: row.impressions,
              conversions: row.conversions,
            },
            bestActive,
          })
        ) {
          changes.push({
            lineKey: row.lineKey,
            stepId,
            action: 'promote',
            status: 'active',
            weight: PROMOTED_INITIAL_WEIGHT,
            previous: { status: 'candidate', weight: row.weight },
            text: row.text,
          });
        }
        continue;
      }
      if (row.status === 'active' && row.source === 'promoted') {
        const adjustment = statsAdjustPromotedWeight({
          stats: { impressions: row.impressions, conversions: row.conversions },
          bestSeedRate,
        });
        if (!adjustment) continue;
        changes.push({
          lineKey: row.lineKey,
          stepId,
          action: adjustment.retire ? 'retire' : 'reweight',
          status: adjustment.retire ? 'retired' : 'active',
          weight: adjustment.weight,
          previous: { status: 'active', weight: row.weight },
        });
      }
    }
  }
  return changes;
}

/**
 * Apply only changes carried by merged promotion/rollback receipts. Each
 * receipt is re-validated against its gate evidence and the current stats
 * for that row, so a stale or fabricated change never ships. Idempotent:
 * reapplying a receipt converges to the same state.
 */
async function applyMergedReceipts(): Promise<{
  promoted: number;
  retired: number;
  reweighted: number;
}> {
  const pending = mergedPromotionReceipts();
  if (pending.length === 0) return { promoted: 0, retired: 0, reweighted: 0 };

  const all = await db.select().from(onboardingScriptLines);
  const byKey = new Map(all.map(row => [row.lineKey, row]));
  const byStep = groupRowsByStep(all);
  const now = new Date();
  let promoted = 0;
  let retired = 0;
  let reweighted = 0;

  for (const { change, evidence, rollback } of pending) {
    const row = byKey.get(change.lineKey);
    if (!row || row.stepId !== change.stepId) continue;
    if (row.status === change.status && row.weight === change.weight) continue;

    const { bestActive, bestSeedRate } = stepGroupStats(
      byStep.get(row.stepId) ?? []
    );

    if (change.action === 'promote') {
      if (
        !shouldPromoteCandidate({
          candidate: {
            text: row.text,
            impressions: row.impressions,
            conversions: row.conversions,
          },
          bestActive,
          gate: evidence,
        })
      ) {
        continue;
      }
    } else if (change.action === 'reweight' || change.action === 'retire') {
      const adjustment = adjustPromotedWeight({
        stats: { impressions: row.impressions, conversions: row.conversions },
        bestSeedRate,
        gate: evidence,
      });
      if (!adjustment) continue;
      if (adjustment.retire !== (change.status === 'retired')) continue;
      if (!adjustment.retire && adjustment.weight !== change.weight) continue;
    } else if (change.action !== 'restore' || !rollback) {
      continue;
    }
    // Rollback 'restore' changes need no gate — reverting copy is always safe.

    await db
      .update(onboardingScriptLines)
      .set({ status: change.status, weight: change.weight, updatedAt: now })
      .where(eq(onboardingScriptLines.id, row.id));
    row.status = change.status;
    row.weight = change.weight;
    if (change.action === 'promote') promoted += 1;
    else if (change.status === 'retired') retired += 1;
    else reweighted += 1;
  }
  return { promoted, retired, reweighted };
}

/**
 * JOV-7148: live-copy changes require a merged promotion receipt — a PR on
 * `apps/web/data/onboarding-script-promotions/` forces the protected
 * ci-promptfoo-evals lane — plus north-star cohort evidence. The flag now
 * gates the whole receipt-apply path, not ungated promotion.
 */
export const ONBOARDING_SCRIPT_AUTO_PROMOTION = true;

export async function runOnboardingScriptAggregation(): Promise<
  Record<string, unknown>
> {
  const seedsInserted = await syncSeeds();
  const countersUpdated = await recomputeServedCounters();
  const candidatesInserted = await mineCandidates();
  const all = await db.select().from(onboardingScriptLines);
  const pendingChanges = planPromotionChanges(all);
  const { promoted, retired, reweighted } = ONBOARDING_SCRIPT_AUTO_PROMOTION
    ? await applyMergedReceipts()
    : { promoted: 0, retired: 0, reweighted: 0 };
  const summary = {
    seedsInserted,
    countersUpdated,
    candidatesInserted,
    promotion: ONBOARDING_SCRIPT_AUTO_PROMOTION ? 'receipt-gated' : 'frozen',
    pendingPromotionChanges: pendingChanges.length,
    promoted,
    retired,
    reweighted,
  };
  logger.info('[onboarding-script-aggregation] completed', summary);
  return summary;
}
