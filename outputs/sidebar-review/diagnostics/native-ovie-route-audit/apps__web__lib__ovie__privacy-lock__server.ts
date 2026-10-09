import 'server-only';
// @coverage-via apps/web/lib/ovie/privacy-lock/server.test.ts
import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { adminStepUpIdentifier } from '@/lib/admin/mfa';
import { getFreshAuth } from '@/lib/auth/cached';
import { getCachedDevTestAuthSession } from '@/lib/auth/dev-test-auth.server';
import { db } from '@/lib/db';
import { userSettings, users } from '@/lib/db/schema/auth';
import { baPasskeys, baVerifications } from '@/lib/db/schema/better-auth';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';
import {
  isFreshPrivacyCeremony,
  OVIE_PRIVACY_UNLOCK_TTL_MS,
  type OviePrivacyPolicy,
  resolveOviePrivacyState,
} from './state';
export type PrivacyAuth = { userId: string; sessionId: string };
export type PrivacyAction = 'enable' | 'disable' | 'lock' | 'unlock';
export class OviePrivacyLockError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 403
  ) {
    super(message);
  }
}
export async function readOviePrivacyPolicy(
  userId: string
): Promise<OviePrivacyPolicy> {
  const [row] = await db
    .select({
      enabled: userSettings.oviePrivacyLockEnabled,
      version: userSettings.oviePrivacyLockVersion,
      lockedAt: userSettings.oviePrivacyLockedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row ?? { enabled: false, version: 0, lockedAt: null };
}
function privacyReceiptId(sessionId: string) {
  return `ovie-privacy-unlock:${sessionId}`;
}
export async function getOviePrivacyLockState(auth: PrivacyAuth) {
  const policy = await readOviePrivacyPolicy(auth.userId);
  if (!policy.enabled)
    return resolveOviePrivacyState(policy, undefined, auth.userId);
  const [receipt] = await db
    .select({
      value: baVerifications.value,
      expiresAt: baVerifications.expiresAt,
    })
    .from(baVerifications)
    .where(eq(baVerifications.id, privacyReceiptId(auth.sessionId)))
    .limit(1);
  return resolveOviePrivacyState(policy, receipt, auth.userId);
}
/** Server-side data boundaries call this before loading/serializing Ovie data. */
export async function assertOviePrivacyUnlocked(
  auth?: PrivacyAuth
): Promise<void> {
  const identity = auth ?? (await getFreshAuth());
  if (!identity.userId || !identity.sessionId)
    throw new OviePrivacyLockError('UNAUTHORIZED', 'Please sign in.', 401);
  // Secretless visual capture has no database to read a policy from
  // (JOV-7126). Only the producer's own dev-test-auth bypass session is
  // exempt — isAdmin already grants that same synthetic actor under this
  // exact gate, so a real session still falls through to the
  // Postgres-backed check below.
  if (
    isVisualCaptureSyntheticAuthEnabled() &&
    (await getCachedDevTestAuthSession())?.dbUserId === identity.userId
  )
    return;
  if ((await getOviePrivacyLockState(identity as PrivacyAuth)).locked)
    throw new OviePrivacyLockError(
      'PRIVACY_UNLOCK_REQUIRED',
      'Unlock Ovie to continue.'
    );
}
/** A device-only passkey never proves the admin factor used by privacy unlock. */
export async function hasUsablePrivacyFactor(userId: string): Promise<boolean> {
  const [factor] = await db
    .select({ id: baPasskeys.id })
    .from(baPasskeys)
    .innerJoin(users, eq(users.betterAuthUserId, baPasskeys.userId))
    .leftJoin(
      baVerifications,
      eq(
        baVerifications.identifier,
        drizzleSql`'device-passkey:' || ${baPasskeys.credentialID}`
      )
    )
    .where(and(eq(users.id, userId), isNull(baVerifications.id)))
    .limit(1);
  return Boolean(factor);
}
export async function mutateOviePrivacyLock(
  auth: PrivacyAuth,
  action: PrivacyAction
) {
  const policy = await readOviePrivacyPolicy(auth.userId);
  const now = new Date();
  if (action === 'enable' && policy.enabled)
    return getOviePrivacyLockState(auth);
  if (action === 'enable' && !(await hasUsablePrivacyFactor(auth.userId)))
    throw new OviePrivacyLockError(
      'PASSKEY_SETUP_REQUIRED',
      'Set up an admin-capable passkey before enabling Ovie privacy lock.'
    );
  if (action === 'enable' || action === 'lock') {
    if (action === 'lock' && !policy.enabled)
      return getOviePrivacyLockState(auth);
    const changed = await db
      .insert(userSettings)
      .values({
        userId: auth.userId,
        oviePrivacyLockEnabled: true,
        oviePrivacyLockVersion: 1,
        oviePrivacyLockedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          oviePrivacyLockEnabled: true,
          oviePrivacyLockVersion: drizzleSql`${userSettings.oviePrivacyLockVersion} + 1`,
          oviePrivacyLockedAt: now,
          updatedAt: now,
        },
        ...(action === 'enable'
          ? { setWhere: eq(userSettings.oviePrivacyLockEnabled, false) }
          : {}),
      })
      .returning({ userId: userSettings.userId });
    // A simultaneous enable must not relock or delete a newer valid receipt.
    if (!changed.length) return getOviePrivacyLockState(auth);
    // Version invalidation is authoritative even if a concurrent unlock wrote a receipt.
    await db
      .delete(baVerifications)
      .where(eq(baVerifications.id, privacyReceiptId(auth.sessionId)));
  } else if (action === 'disable') {
    const state = await getOviePrivacyLockState(auth);
    if (state.enabled && state.locked)
      throw new OviePrivacyLockError(
        'PRIVACY_UNLOCK_REQUIRED',
        'Unlock Ovie before disabling its privacy lock.'
      );
    if (!policy.enabled) return state;
    const changed = await db
      .update(userSettings)
      .set({
        oviePrivacyLockEnabled: false,
        oviePrivacyLockVersion: drizzleSql`${userSettings.oviePrivacyLockVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(userSettings.userId, auth.userId),
          eq(userSettings.oviePrivacyLockVersion, policy.version)
        )
      )
      .returning({ userId: userSettings.userId });
    if (!changed.length)
      throw new OviePrivacyLockError(
        'PRIVACY_STATE_CHANGED',
        'Ovie was relocked. Unlock it again.'
      );
  } else {
    if (!policy.enabled)
      throw new OviePrivacyLockError(
        'PRIVACY_NOT_ENABLED',
        'Enable Ovie privacy lock first.',
        400
      );
    const state = await getOviePrivacyLockState(auth);
    if (!state.locked) return state; // An ordinary repeated request never extends the original 24h.
    const [proof] = await db
      .select({
        value: baVerifications.value,
        expiresAt: baVerifications.expiresAt,
      })
      .from(baVerifications)
      .where(
        eq(baVerifications.identifier, adminStepUpIdentifier(auth.sessionId))
      )
      .limit(1);
    if (
      !proof ||
      !isFreshPrivacyCeremony(
        proof.value,
        proof.expiresAt,
        policy,
        now.getTime()
      )
    )
      throw new OviePrivacyLockError(
        'PASSKEY_STEP_UP_REQUIRED',
        'Verify your passkey to unlock Ovie.'
      );
    const verifiedAt = Date.parse(proof.value);
    const id = privacyReceiptId(auth.sessionId);
    const receipt = {
      id,
      identifier: id,
      value: JSON.stringify({
        userId: auth.userId,
        version: policy.version,
        unlockedAt: verifiedAt,
      }),
      expiresAt: new Date(verifiedAt + OVIE_PRIVACY_UNLOCK_TTL_MS),
    };
    await db
      .insert(baVerifications)
      .values(receipt)
      .onConflictDoUpdate({
        target: baVerifications.id,
        set: {
          value: receipt.value,
          expiresAt: receipt.expiresAt,
          updatedAt: now,
        },
      });
  }
  const state = await getOviePrivacyLockState(auth);
  if (action === 'unlock' && state.locked)
    throw new OviePrivacyLockError(
      'PRIVACY_STATE_CHANGED',
      'Ovie was relocked. Verify your passkey again.'
    );
  return state;
}
