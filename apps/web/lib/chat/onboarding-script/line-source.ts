import 'server-only';
import { eq } from 'drizzle-orm';
import { repairCopyFloorText } from '@/lib/chat/copy-floor-repair';
import { lintVoice } from '@/lib/chat/voice-lint';
import { excludeOtherSegments } from '@/lib/creator/segment-registry';
import type { ResolvedSegment } from '@/lib/creator/segments';
import { db } from '@/lib/db';
import { onboardingScriptLines } from '@/lib/db/schema/onboarding-script';
import { logger } from '@/lib/utils/logger';
import {
  hashSessionId,
  isScriptStepId,
  linesForStep,
  SCRIPT_STEP_IDS,
  type ScriptLine,
  type ScriptStepId,
} from './script';

/**
 * Servable line bank: code seeds merged with DB rows (JOV-3806).
 *
 * Seeds always serve (their text lives in code; a DB seed row only
 * contributes its tuned weight). Promoted rows — lint-gated LLM responses
 * that out-converted the seeds — serve from DB text. Any DB failure
 * degrades to seeds-only: the fallback path must never gain a hard DB
 * dependency beyond what the handler already has.
 */

export interface ServableLine {
  readonly line: ScriptLine;
  readonly weight: number;
  /** 'seed' lines are the holdout arm; 'promoted' only serve to treatment. */
  readonly source: 'seed' | 'promoted';
}

export type ScriptBank = ReadonlyMap<ScriptStepId, readonly ServableLine[]>;

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * JOV-7148 holdout arm: ~5% of sessions deterministically serve seed lines
 * only, giving the learning loop a stable control group to detect regressions
 * from promoted copy. The arm is a pure function of sessionId, so a visitor
 * never flips arms between steps.
 */
export const HOLDOUT_MODULUS = 20;

export function isHoldoutSession(sessionId: string): boolean {
  return hashSessionId(sessionId) % HOLDOUT_MODULUS === 0;
}

/**
 * Steps whose words describe state the promoted copy cannot see: the access
 * decision card below the line, or the handle card shipped in the same turn.
 * Only code seeds serve these (2026-10-31 golden-path walk: a promoted
 * waitlist line said "Putting you on the early list" above a card saying
 * "You are not on the list until the confirmation appears").
 */
const SEED_ONLY_STEPS: ReadonlySet<ScriptStepId> = new Set([
  'confirm_artist',
  'confirm_artist_no_data',
  'attach_social',
  'instant_access',
  'golden_path_admitted',
  'waitlist',
]);

/**
 * Promoted DB text must pass today's copy floor, not the one it was promoted
 * under. Returns the servable text (mechanical repairs applied) or null.
 */
function servablePromotedText(text: string): string | null {
  const repaired = repairCopyFloorText(text);
  return lintVoice(repaired).ok ? repaired : null;
}

let cache: { bank: ScriptBank; expiresAt: number } | null = null;

/** Test hook. */
export function resetScriptBankCache(): void {
  cache = null;
}

function seedBank(): Map<ScriptStepId, ServableLine[]> {
  const bank = new Map<ScriptStepId, ServableLine[]>();
  for (const stepId of SCRIPT_STEP_IDS) {
    bank.set(
      stepId,
      linesForStep(stepId).map(line => ({
        line,
        weight: 100,
        source: 'seed' as const,
      }))
    );
  }
  return bank;
}

export async function loadScriptBank(): Promise<ScriptBank> {
  if (cache && Date.now() < cache.expiresAt) return cache.bank;

  const bank = seedBank();
  try {
    const rows = await db
      .select()
      .from(onboardingScriptLines)
      .where(eq(onboardingScriptLines.status, 'active'));
    for (const row of rows) {
      if (!isScriptStepId(row.stepId)) continue;
      const entries = bank.get(row.stepId);
      if (!entries) continue;
      const seedIndex = entries.findIndex(
        entry => entry.line.key === row.lineKey
      );
      if (seedIndex >= 0) {
        // Seed row: DB contributes the tuned weight; text stays code-side.
        const seed = entries[seedIndex];
        if (seed) entries[seedIndex] = { ...seed, weight: row.weight };
        continue;
      }
      if (SEED_ONLY_STEPS.has(row.stepId)) continue;
      const text = servablePromotedText(row.text);
      if (text === null) continue;
      entries.push({
        line: {
          key: row.lineKey as ScriptLine['key'],
          stepId: row.stepId,
          variant: row.variant,
          text,
        },
        weight: row.weight,
        source: 'promoted',
      });
    }
  } catch (error) {
    logger.warn('Onboarding script bank DB load failed; serving seeds', {
      error,
    });
  }

  cache = { bank, expiresAt: Date.now() + CACHE_TTL_MS };
  return bank;
}

/**
 * Deterministic weighted pick: the session hash lands in [0, totalWeight),
 * so one visitor sees a stable line while weights shape the distribution
 * across visitors.
 */
export function pickFromBank(
  bank: ScriptBank,
  stepId: ScriptStepId,
  sessionId: string,
  segment?: ResolvedSegment
): ScriptLine {
  // Segment gate (JOV-9679): when a segment is resolved, lines scoped to other
  // segments are never candidates. If that empties the step, fall back to the
  // unfiltered bank rather than leave the visitor without a reply.
  const allEntries = bank.get(stepId) ?? [];
  const scoped = allEntries.filter(
    entry => excludeOtherSegments([entry.line], segment).length > 0
  );
  const bankEntries = scoped.length > 0 ? scoped : allEntries;
  // Holdout arm: stable excluded group that only ever sees seed lines, so
  // promoted copy can be measured against an unexposed control.
  const entries = isHoldoutSession(sessionId)
    ? bankEntries.filter(entry => entry.source === 'seed')
    : bankEntries;
  const total = entries.reduce(
    (sum, entry) => sum + Math.max(entry.weight, 0),
    0
  );
  if (entries.length === 0 || total <= 0) {
    // Bank rows exhausted or all zero-weight — seeds are the floor.
    const allSeeds = linesForStep(stepId);
    const gated = excludeOtherSegments(allSeeds, segment);
    const seeds = gated.length > 0 ? gated : allSeeds;
    const seed = seeds[hashSessionId(sessionId) % Math.max(seeds.length, 1)];
    if (!seed) throw new Error(`No script lines defined for step ${stepId}`);
    return seed;
  }
  let cursor = hashSessionId(sessionId) % total;
  for (const entry of entries) {
    cursor -= Math.max(entry.weight, 0);
    if (cursor < 0) return entry.line;
  }
  const last = entries.at(-1);
  if (!last) throw new Error(`Weighted pick failed for step ${stepId}`);
  return last.line;
}
