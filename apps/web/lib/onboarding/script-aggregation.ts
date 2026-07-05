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

/**
 * Nightly self-improvement job for the deterministic onboarding script
 * (JOV-3806). Runs as a sub-job of /api/cron/daily-maintenance.
 *
 * 1. Mirror code seeds into onboarding_script_lines (insert-only).
 * 2. Recompute impressions/conversions per served line over a 90-day
 *    window (idempotent — no watermark).
 * 3. Mine candidate lines from LLM responses in onboarding conversations:
 *    lint-clean, generic-step only, seen in ≥5 converted conversations.
 *    Candidates are stored but NOT served.
 * 4. Promote a candidate to active when its source-response conversion
 *    rate beats the best active line for that step by ≥1.2× with enough
 *    volume on both sides.
 * 5. Re-weight active promoted lines; retire ones that stopped converting.
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

/** Promotion rule — pure, unit-tested. */
export function shouldPromoteCandidate(input: {
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

/** Weight adjustment for active promoted lines — pure, unit-tested. */
export function adjustPromotedWeight(input: {
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
    const text = row.content.trim();
    if (text.length < 20 || text.length > 500) continue;
    const stepId = deriveStepFromToolEvents(row.toolCalls);
    if (!stepId || !PROMOTABLE_STEPS.includes(stepId)) continue;
    const key = `${stepId} ${text}`;
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

async function promoteAndReweight(): Promise<{
  promoted: number;
  retired: number;
  reweighted: number;
}> {
  const all = await db.select().from(onboardingScriptLines);
  const byStep = new Map<string, typeof all>();
  for (const row of all) {
    const group = byStep.get(row.stepId) ?? [];
    group.push(row);
    byStep.set(row.stepId, group);
  }

  let promoted = 0;
  let retired = 0;
  let reweighted = 0;
  const now = new Date();

  for (const [, group] of byStep) {
    const active = group.filter(row => row.status === 'active');
    const bestActive = active
      .filter(row => row.impressions >= MIN_IMPRESSIONS_FOR_PROMOTION)
      .sort((a, b) => rate(b) - rate(a))[0];
    const qualifiedSeeds = active.filter(
      row =>
        row.source === 'seed' &&
        row.impressions >= MIN_IMPRESSIONS_FOR_PROMOTION
    );
    const bestSeedRate =
      qualifiedSeeds.length > 0
        ? Math.max(...qualifiedSeeds.map(row => rate(row)))
        : null;

    for (const row of group) {
      if (row.status === 'candidate') {
        const promote = shouldPromoteCandidate({
          candidate: {
            text: row.text,
            impressions: row.impressions,
            conversions: row.conversions,
          },
          bestActive: bestActive
            ? {
                impressions: bestActive.impressions,
                conversions: bestActive.conversions,
              }
            : null,
        });
        if (promote) {
          await db
            .update(onboardingScriptLines)
            .set({
              status: 'active',
              weight: PROMOTED_INITIAL_WEIGHT,
              updatedAt: now,
            })
            .where(eq(onboardingScriptLines.id, row.id));
          promoted += 1;
        }
        continue;
      }
      if (row.status === 'active' && row.source === 'promoted') {
        const adjustment = adjustPromotedWeight({
          stats: { impressions: row.impressions, conversions: row.conversions },
          bestSeedRate,
        });
        if (!adjustment) continue;
        await db
          .update(onboardingScriptLines)
          .set({
            weight: adjustment.weight,
            status: adjustment.retire ? 'retired' : 'active',
            updatedAt: now,
          })
          .where(eq(onboardingScriptLines.id, row.id));
        if (adjustment.retire) retired += 1;
        else reweighted += 1;
      }
    }
  }
  return { promoted, retired, reweighted };
}

export async function runOnboardingScriptAggregation(): Promise<
  Record<string, unknown>
> {
  const seedsInserted = await syncSeeds();
  const countersUpdated = await recomputeServedCounters();
  const candidatesInserted = await mineCandidates();
  const { promoted, retired, reweighted } = await promoteAndReweight();
  const summary = {
    seedsInserted,
    countersUpdated,
    candidatesInserted,
    promoted,
    retired,
    reweighted,
  };
  logger.info('[onboarding-script-aggregation] completed', summary);
  return summary;
}
