export const OVIE_PRIVACY_UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;
export const OVIE_PRIVACY_CEREMONY_MAX_AGE_MS = 5 * 60 * 1000;
export interface OviePrivacyLockState {
  enabled: boolean;
  locked: boolean;
  unlockedUntil: string | null;
}
export interface OviePrivacyPolicy {
  enabled: boolean;
  version: number;
  lockedAt: Date | null;
}
export function resolveOviePrivacyState(
  policy: OviePrivacyPolicy,
  receipt: { value: string; expiresAt: Date } | undefined,
  userId: string,
  now: number = Date.now()
): OviePrivacyLockState {
  if (!policy.enabled)
    return { enabled: false, locked: false, unlockedUntil: null };
  const locked = { enabled: true, locked: true, unlockedUntil: null } as const;
  if (!receipt) return locked;
  try {
    const value = JSON.parse(receipt.value);
    const issuedAt = value.unlockedAt;
    const expiry = receipt.expiresAt.getTime();
    if (
      value.userId !== userId ||
      value.version !== policy.version ||
      !Number.isFinite(issuedAt) ||
      issuedAt > now ||
      (policy.lockedAt !== null && issuedAt <= policy.lockedAt.getTime()) ||
      !Number.isFinite(expiry) ||
      expiry <= now ||
      expiry > issuedAt + OVIE_PRIVACY_UNLOCK_TTL_MS
    )
      return locked;
    return {
      enabled: true,
      locked: false,
      unlockedUntil: receipt.expiresAt.toISOString(),
    };
  } catch {
    return locked;
  }
}
export function isFreshPrivacyCeremony(
  value: string,
  expiresAt: Date,
  policy: OviePrivacyPolicy,
  now = Date.now()
): boolean {
  const verifiedAt = Date.parse(value);
  return (
    Number.isFinite(verifiedAt) &&
    verifiedAt <= now &&
    now - verifiedAt <= OVIE_PRIVACY_CEREMONY_MAX_AGE_MS &&
    expiresAt.getTime() > now &&
    (policy.lockedAt === null || verifiedAt > policy.lockedAt.getTime())
  );
}
