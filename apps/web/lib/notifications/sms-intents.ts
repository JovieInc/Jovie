import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type SmsSubscribeIntent,
  smsSubscribeIntents,
} from '@/lib/db/schema/notifications';
import { env } from '@/lib/env-server';

/**
 * Intent code alphabet: A-Z plus 2-9, excluding I O 0 1 to avoid
 * iOS autocorrect and visual ambiguity. 32 symbols * 8 chars ≈ 1.1e12
 * keyspace. Combined with one-time-use, fingerprint-binding, 10-min
 * expiry, and per-IP/per-phone rate limits, brute-force is infeasible.
 */
export const INTENT_CODE_LENGTH = 8;
export const INTENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as const;
export const INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a single intent code. Uses crypto.randomBytes for unbiased
 * draws across a 32-symbol alphabet by rejecting bytes ≥ 224 (largest
 * multiple of 32 ≤ 255 is 224).
 */
export function generateIntentCode(): string {
  const out: string[] = [];
  while (out.length < INTENT_CODE_LENGTH) {
    const buf = randomBytes(INTENT_CODE_LENGTH * 2);
    for (const byte of buf) {
      if (byte >= 224) continue;
      out.push(INTENT_CODE_ALPHABET[byte % INTENT_CODE_ALPHABET.length]);
      if (out.length >= INTENT_CODE_LENGTH) break;
    }
  }
  return out.join('');
}

function getIntentSecret(): string {
  const secret = env.SMS_INTENT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'SMS_INTENT_SECRET must be set to a value >=16 chars before issuing intents'
    );
  }
  return secret;
}

/**
 * Hash an intent code with the runtime secret. The plaintext is never
 * persisted; verification is by re-hashing the inbound code and looking
 * up by `code_hash`.
 */
export function hashIntentCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return createHash('sha256')
    .update(normalized, 'utf8')
    .update(getIntentSecret(), 'utf8')
    .digest('hex');
}

export interface FingerprintInputs {
  visitorId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  artistId: string;
}

/**
 * Compute the deterministic fingerprint that binds an intent to its
 * originating browser session. Stored as `fingerprintHash`; checked on
 * `status` polling and (less strictly) at confirm time so the originating
 * tab is the only one that can see the masked phone.
 *
 * Tolerates missing fields (e.g. cookies disabled): the fingerprint is
 * present-or-absent per-session, never stale across sessions.
 */
export function computeIntentFingerprint(inputs: FingerprintInputs): string {
  const parts = [
    inputs.visitorId ?? '',
    inputs.ipHash ?? '',
    inputs.userAgentHash ?? '',
    inputs.artistId,
  ];
  return createHash('sha256')
    .update(parts.join(''), 'utf8')
    .update(getIntentSecret(), 'utf8')
    .digest('hex');
}

/**
 * Hash a request IP. Uses the intent secret so hashes can't be precomputed.
 */
export function hashIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256')
    .update(ip, 'utf8')
    .update(getIntentSecret(), 'utf8')
    .digest('hex');
}

/**
 * Hash a user agent string with the intent secret.
 */
export function hashUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return createHash('sha256')
    .update(ua, 'utf8')
    .update(getIntentSecret(), 'utf8')
    .digest('hex');
}

export interface CreateIntentInputs {
  creatorProfileId: string;
  visitorId?: string | null;
  audienceMemberId?: string | null;
  source: string;
  sourceUrl?: string | null;
  countryCode?: string | null;
  consentTextHash: string;
  consentVersion: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
}

export interface CreateIntentResult {
  intent: SmsSubscribeIntent;
  code: string;
}

/**
 * Generate a new intent code, hash it, persist the row, and return the
 * plaintext code to the caller. Plaintext leaves this function only as
 * the API response body to the originating browser.
 */
export async function createIntent(
  inputs: CreateIntentInputs
): Promise<CreateIntentResult> {
  const code = generateIntentCode();
  const codeHash = hashIntentCode(code);
  const fingerprintHash = computeIntentFingerprint({
    visitorId: inputs.visitorId,
    ipHash: inputs.ipHash,
    userAgentHash: inputs.userAgentHash,
    artistId: inputs.creatorProfileId,
  });
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  const [intent] = await db
    .insert(smsSubscribeIntents)
    .values({
      codeHash,
      creatorProfileId: inputs.creatorProfileId,
      visitorId: inputs.visitorId ?? null,
      audienceMemberId: inputs.audienceMemberId ?? null,
      source: inputs.source,
      sourceUrl: inputs.sourceUrl ?? null,
      countryCode: inputs.countryCode ?? null,
      consentTextHash: inputs.consentTextHash,
      consentVersion: inputs.consentVersion,
      ipHash: inputs.ipHash ?? null,
      userAgentHash: inputs.userAgentHash ?? null,
      fingerprintHash,
      status: 'created',
      expiresAt,
    })
    .returning();

  return { intent, code };
}

export type ConsumeIntentResult =
  | { status: 'confirmed'; intent: SmsSubscribeIntent }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'already_consumed' };

/**
 * Atomic intent consume. Implements codex ENG-N2 + audit row #35.
 *
 * Single UPDATE with WHERE-clause-on-status + expiry check. If rowcount=1
 * we won the race and the intent is now `confirmed`; the returned row
 * carries the bind context (creatorProfileId, fingerprintHash, etc.).
 *
 * If rowcount=0, we look up the intent to discriminate between `not_found`,
 * `expired`, and `already_consumed` so the webhook can pick the right
 * fan-facing reply.
 */
export async function consumeIntentByCode(
  code: string,
  bind: { phone: string; provider: string; providerMessageId: string }
): Promise<ConsumeIntentResult> {
  const codeHash = hashIntentCode(code);
  const now = new Date();

  const updated = await db
    .update(smsSubscribeIntents)
    .set({
      status: 'confirmed',
      phone: bind.phone,
      provider: bind.provider,
      providerMessageId: bind.providerMessageId,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(smsSubscribeIntents.codeHash, codeHash),
        drizzleSql`${smsSubscribeIntents.status} IN ('created', 'sms_received')`,
        drizzleSql`${smsSubscribeIntents.expiresAt} > ${now}`
      )
    )
    .returning();

  if (updated.length === 1) {
    return { status: 'confirmed', intent: updated[0] };
  }

  // Rowcount=0 → diagnose the cause.
  const existing = await db
    .select()
    .from(smsSubscribeIntents)
    .where(eq(smsSubscribeIntents.codeHash, codeHash))
    .limit(1);

  if (existing.length === 0) {
    return { status: 'not_found' };
  }

  const row = existing[0];
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { status: 'expired' };
  }
  // Status was not in ('created','sms_received') and not expired → consumed.
  return { status: 'already_consumed' };
}

/**
 * Fetch an intent by ID for status polling. Returns null if not found or
 * if the fingerprint check fails (privacy: a stranger's tab cannot learn
 * a masked phone from a known intent ID).
 */
export async function getIntentForPolling(
  intentId: string,
  expectedFingerprintHash: string
): Promise<SmsSubscribeIntent | null> {
  const rows = await db
    .select()
    .from(smsSubscribeIntents)
    .where(eq(smsSubscribeIntents.id, intentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.fingerprintHash) {
    // Legacy / unbound intents — only return generic status, not phone PII.
    return row;
  }
  const expectedBuf = Buffer.from(expectedFingerprintHash, 'hex');
  const storedBuf = Buffer.from(row.fingerprintHash, 'hex');
  if (
    expectedBuf.length !== storedBuf.length ||
    !timingSafeEqual(expectedBuf, storedBuf)
  ) {
    return null;
  }
  return row;
}

/**
 * Mark an intent as expired. Called by the daily janitor cron and by the
 * webhook when it diagnoses an expiry.
 */
export async function markIntentExpired(intentId: string): Promise<void> {
  await db
    .update(smsSubscribeIntents)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(smsSubscribeIntents.id, intentId));
}
