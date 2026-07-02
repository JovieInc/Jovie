import 'server-only';
import { eq } from 'drizzle-orm';
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
}

export type ScriptBank = ReadonlyMap<ScriptStepId, readonly ServableLine[]>;

const CACHE_TTL_MS = 5 * 60 * 1000;

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
      linesForStep(stepId).map(line => ({ line, weight: 100 }))
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
        if (seed) entries[seedIndex] = { line: seed.line, weight: row.weight };
        continue;
      }
      entries.push({
        line: {
          key: row.lineKey as ScriptLine['key'],
          stepId: row.stepId,
          variant: row.variant,
          text: row.text,
        },
        weight: row.weight,
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
  sessionId: string
): ScriptLine {
  const entries = bank.get(stepId) ?? [];
  const total = entries.reduce(
    (sum, entry) => sum + Math.max(entry.weight, 0),
    0
  );
  if (entries.length === 0 || total <= 0) {
    // Bank rows exhausted or all zero-weight — seeds are the floor.
    const seeds = linesForStep(stepId);
    const seed = seeds[hashSessionId(sessionId) % Math.max(seeds.length, 1)];
    if (!seed) throw new Error(`No script lines defined for step ${stepId}`);
    return seed;
  }
  let cursor = hashSessionId(sessionId) % total;
  for (const entry of entries) {
    cursor -= Math.max(entry.weight, 0);
    if (cursor < 0) return entry.line;
  }
  const last = entries[entries.length - 1];
  if (!last) throw new Error(`Weighted pick failed for step ${stepId}`);
  return last.line;
}
