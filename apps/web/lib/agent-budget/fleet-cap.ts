import { and, sql as drizzleSql, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentRuns } from '@/lib/db/schema/agent-runs';

/**
 * Global daily fleet-wide spend ceiling. A circuit-breaker independent
 * of per-user caps — protects against bugs, prompt loops, and provider
 * misbehavior that could burn money across tenants.
 */

const DEFAULT_DAILY_CAP_CENTS = 50_000; // $500/day default

export function getFleetDailyCapCents(): number {
  const raw = process.env.GLOBAL_DAILY_AI_CENTS_CAP;
  if (!raw) return DEFAULT_DAILY_CAP_CENTS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP_CENTS;
}

export function isRuntimeDisabled(): boolean {
  return process.env.AGENT_RUNTIME_DISABLED === '1';
}

/**
 * Check fleet cap before scheduling a new tool call. Returns true if
 * fleet cap is clear (or if check is misconfigured — fail-open with a
 * warning so ops can still push work through during monitoring issues).
 */
export async function fleetCapAvailable(
  additionalCents: number
): Promise<{ ok: boolean; spentTodayCents: number; capCents: number }> {
  const cap = getFleetDailyCapCents();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: drizzleSql<number>`COALESCE(SUM(${agentRuns.costCents}), 0)`,
    })
    .from(agentRuns)
    .where(and(gte(agentRuns.startedAt, startOfDay)));

  const spentToday = Number(row?.total ?? 0);
  return {
    ok: spentToday + additionalCents <= cap,
    spentTodayCents: spentToday,
    capCents: cap,
  };
}
