// Mock for @/lib/observability/revenue-spine in Storybook.
// The real module imports node:crypto (createHash) at module scope, which vite
// externalizes for the browser. It is reachable from story-rendered modules
// through lib/auth/cached, lib/db/client/session and lib/entitlements/server,
// so the externalized import blanked every story on that graph. Stories never
// report revenue-spine failures; the capture is a no-op here.

export const REVENUE_SPINE_STAGES = [
  'auth_resolution',
  'checkout',
  'entitlement_readback',
  'onboarding_persistence',
  'profile_claim',
  'returning_access',
  'rls_setup',
  'stripe_sync',
  'webhook',
] as const;

export const REVENUE_SPINE_FAILURE_CODES = [
  'billing_unavailable',
  'claim_expired',
  'concurrent_update',
  'configuration_missing',
  'dependency_unavailable',
  'identity_unlinked',
  'invalid_signature',
  'ownership_conflict',
  'permission_denied',
  'plan_mismatch',
  'record_missing',
  'schema_missing',
  'timeout',
  'unauthenticated',
  'unexpected_error',
  'unique_conflict',
] as const;

export type RevenueSpineStage = (typeof REVENUE_SPINE_STAGES)[number];

export function buildRevenueSpineFailure(): never {
  throw new Error('buildRevenueSpineFailure is unavailable in Storybook');
}

export function captureRevenueSpineFailure(): void {
  // Storybook never reports revenue-spine failures.
}
