import 'server-only';

import { validateEnvironment } from '@/lib/env-server';

/**
 * Whether the operator env-health banner may render for this request.
 * Mirrors client gating in OperatorBanner (non-production or explicit flag).
 */
export function isOperatorBannerEnvironmentEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_SHOW_OPERATOR_BANNER === 'true'
  );
}

/**
 * Critical + error env validation issues for the operator banner.
 * Returns an empty array when the environment is healthy.
 */
export function getOperatorEnvIssues(): readonly string[] {
  const validation = validateEnvironment('runtime');
  return [...validation.critical, ...validation.errors];
}
