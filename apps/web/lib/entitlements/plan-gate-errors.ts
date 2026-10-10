/** Stable entitlement-denial codes shared across server and client boundaries. */
export const ENTITLEMENT_DENIAL_CODES = {
  TASKS_WORKSPACE_LOCKED: 'TASKS_WORKSPACE_LOCKED',
  RELEASE_PLAN_LOCKED: 'RELEASE_PLAN_LOCKED',
} as const;

export type EntitlementDenialCode =
  (typeof ENTITLEMENT_DENIAL_CODES)[keyof typeof ENTITLEMENT_DENIAL_CODES];

/**
 * Fallback for framework boundaries that preserve only an error message.
 * Prefer the stable name/code checks in `isEntitlementDenialError` whenever
 * Next.js preserves them.
 */
export const ENTITLEMENT_DENIAL_MESSAGE_PATTERN =
  /\brequires?\s+(?:an?\s+|the\s+)?(?:pro|artist presence)\s+plan\b/i;

export function asEntitlementDenialCode(
  value: unknown
): EntitlementDenialCode | undefined {
  if (typeof value !== 'string') return undefined;
  return Object.values(ENTITLEMENT_DENIAL_CODES).includes(
    value as EntitlementDenialCode
  )
    ? (value as EntitlementDenialCode)
    : undefined;
}

export function isEntitlementDenialMessage(message: string): boolean {
  return ENTITLEMENT_DENIAL_MESSAGE_PATTERN.test(message);
}

export function isEntitlementDenialError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  if (
    'code' in error &&
    asEntitlementDenialCode((error as { readonly code?: unknown }).code) != null
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'TasksUpgradeRequiredError' ||
    isEntitlementDenialMessage(error.message)
  );
}
