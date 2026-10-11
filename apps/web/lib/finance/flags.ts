import 'server-only';

import { getAppFlagValue } from '@/lib/flags/server';

/**
 * Creator Financial Health release gate (JOV-4621).
 *
 * The `CREATOR_FINANCE` app flag defaults OFF for everyone — including admins
 * — and stays off until the JOV-4621 privacy/correctness matrix is certified.
 * `FINANCE_DISABLE` is an environment kill switch that forces the feature off
 * immediately, independent of flag-resolution latency; it exists so a
 * fleet-wide stop needs only an env change, not a flag write or deploy.
 */

export const FINANCE_DISABLE_ENV = 'FINANCE_DISABLE' as const;

export const FINANCE_DISABLED_ERROR = 'Creator finance is disabled' as const;

export class FinanceFeatureDisabledError extends Error {
  constructor() {
    super(FINANCE_DISABLED_ERROR);
    this.name = 'FinanceFeatureDisabledError';
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/** True when the env kill switch forces the feature off right now. */
export function isFinanceKillSwitchEngaged(): boolean {
  return isTruthyEnv(process.env[FINANCE_DISABLE_ENV]);
}

/**
 * Resolve whether Creator Financial Health is enabled for this request.
 * Returns false when the kill switch is engaged or the flag is off; it never
 * throws on flag-evaluation failure — the gate fails closed.
 */
export async function isCreatorFinanceEnabled(
  userId?: string | null
): Promise<boolean> {
  if (isFinanceKillSwitchEngaged()) {
    return false;
  }
  try {
    return await getAppFlagValue('CREATOR_FINANCE', { userId });
  } catch {
    return false;
  }
}

/**
 * Throw `FinanceFeatureDisabledError` when the feature is off. Callers map
 * this to their enumeration-safe "not found"/generic response — disabled
 * finance surfaces must be indistinguishable from absent ones.
 */
export async function assertCreatorFinanceEnabled(
  userId?: string | null
): Promise<void> {
  if (!(await isCreatorFinanceEnabled(userId))) {
    throw new FinanceFeatureDisabledError();
  }
}
