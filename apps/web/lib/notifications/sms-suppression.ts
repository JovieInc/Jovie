import 'server-only';
import { createHash } from 'node:crypto';
import { and, sql as drizzleSql, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { notificationContacts } from '@/lib/db/schema/notifications';
import { normalizeSubscriptionPhone } from '@/lib/notifications/validation';
import { logger } from '@/lib/utils/logger';
import { logSafePhone } from '@/lib/utils/pii';

/**
 * Single canonical E.164 phone normalizer. Wraps the existing
 * `normalizeSubscriptionPhone` so all SMS code paths agree on format.
 *
 * Returns null for any input that fails E.164 (`+\d{7,15}` with non-zero
 * country digit). Always normalize before hashing or storing.
 */
export function normalizePhoneE164(
  raw: string | null | undefined
): string | null {
  return normalizeSubscriptionPhone(raw);
}

/**
 * SHA-256 of the normalized E.164 phone, hex-encoded. Used for fast lookup
 * and dedup; never as a secret.
 */
export function hashPhoneE164(phone: string): string {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) {
    throw new Error('Cannot hash invalid phone number');
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Optional convenience that returns `null` instead of throwing when the
 * input cannot be normalized.
 */
export function tryHashPhoneE164(
  raw: string | null | undefined
): string | null {
  const normalized = normalizePhoneE164(raw);
  if (!normalized) return null;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export interface SmsSuppressionState {
  suppressed: boolean;
  reason: 'stopped' | 'blocked' | null;
}

/**
 * Check whether a phone is globally suppressed for SMS sends.
 * Returns suppressed=false for unknown phones (suppression is opt-in).
 */
export async function isPhoneSmsSuppressed(
  phoneOrHash: string
): Promise<SmsSuppressionState> {
  const phoneHash =
    phoneOrHash.length === 64 && /^[a-f0-9]+$/i.test(phoneOrHash)
      ? phoneOrHash
      : tryHashPhoneE164(phoneOrHash);
  if (!phoneHash) {
    return { suppressed: false, reason: null };
  }
  const rows = await db
    .select({ smsStatus: notificationContacts.smsStatus })
    .from(notificationContacts)
    .where(eq(notificationContacts.phoneHash, phoneHash))
    .limit(1);
  const row = rows[0];
  if (!row) return { suppressed: false, reason: null };
  if (row.smsStatus === 'stopped') {
    return { suppressed: true, reason: 'stopped' };
  }
  if (row.smsStatus === 'blocked') {
    return { suppressed: true, reason: 'blocked' };
  }
  return { suppressed: false, reason: null };
}

export interface SuppressMetadata {
  source: string;
  providerEventId?: string;
  rawCommand?: string;
}

/**
 * Apply a global STOP from inbound SMS.
 *
 * Two cascading effects:
 * 1. Set `notification_contacts.smsStatus = 'stopped'` (creates the row if
 *    none exists — STOP from an unknown number is still legitimate).
 * 2. Set `unsubscribedAt` on every active per-artist `notification_subscriptions`
 *    row matching the phone. Per-artist consent fields are NOT cleared so
 *    the audit trail survives.
 *
 * Idempotent: calling twice is a no-op on the second call.
 */
export async function suppressPhoneForStop(
  phone: string,
  metadata: SuppressMetadata
): Promise<{ contactId: string }> {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) {
    throw new Error('Cannot suppress invalid phone number');
  }
  const phoneHash = hashPhoneE164(normalized);
  const now = new Date();

  const result = await db.transaction(async tx => {
    const [contact] = await tx
      .insert(notificationContacts)
      .values({
        phone: normalized,
        phoneHash,
        smsStatus: 'stopped',
        firstSource: metadata.source,
        metadata: {
          stopProviderEventId: metadata.providerEventId,
          stopRawCommand: metadata.rawCommand,
        },
      })
      .onConflictDoUpdate({
        target: notificationContacts.phoneHash,
        set: {
          smsStatus: 'stopped',
          updatedAt: now,
        },
      })
      .returning({ id: notificationContacts.id });

    await tx
      .update(notificationSubscriptions)
      .set({ unsubscribedAt: now })
      .where(
        and(
          eq(notificationSubscriptions.phone, normalized),
          drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`
        )
      );

    return { contactId: contact.id };
  });

  logger.info('SMS suppression applied', {
    phone: logSafePhone(normalized),
    source: metadata.source,
    providerEventId: metadata.providerEventId,
  });

  return result;
}

export interface ReactivateMetadata {
  source: string;
  consentTextHash: string;
  consentVersion: string;
  providerEventId?: string;
}

/**
 * Reverse a global STOP after a verified opt-in (CTIA convention: START,
 * UNSTOP, YES). Flips `notification_contacts.smsStatus` back to 'active'
 * and refreshes the global consent stamp. Per-artist subscription rows
 * remain unsubscribed — fans must explicitly re-subscribe per artist.
 */
export async function reactivatePhoneAfterVerifiedOptIn(
  phone: string,
  metadata: ReactivateMetadata
): Promise<{ contactId: string | null }> {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) return { contactId: null };
  const phoneHash = hashPhoneE164(normalized);
  const now = new Date();

  const updated = await db
    .update(notificationContacts)
    .set({
      smsStatus: 'active',
      smsConsentAt: now,
      smsConsentTextHash: metadata.consentTextHash,
      smsConsentVersion: metadata.consentVersion,
      phoneVerifiedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationContacts.phoneHash, phoneHash),
        isNotNull(notificationContacts.phoneHash)
      )
    )
    .returning({ id: notificationContacts.id });

  if (updated.length === 0) {
    logger.warn('Reactivate called for unknown contact', {
      phone: logSafePhone(normalized),
      source: metadata.source,
    });
    return { contactId: null };
  }

  logger.info('SMS contact reactivated', {
    phone: logSafePhone(normalized),
    source: metadata.source,
  });

  return { contactId: updated[0].id };
}
