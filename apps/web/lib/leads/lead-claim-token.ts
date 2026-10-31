import 'server-only';

import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { deriveSecret } from '@/lib/email/hmac-token';
import {
  type ClaimTokenPair,
  generateClaimTokenPair,
  hashClaimToken,
} from '@/lib/security/claim-token';

/**
 * Lead claim tokens are stored hashed, like the profile token. The plaintext
 * is never persisted: it is derived on demand from the lead id and the stored
 * expiry with a server secret, and accepted only if its SHA-256 equals the
 * stored hash. One canonical token per lead therefore still serves the email
 * batch, the DM copy and the approved-copy revision without a plaintext column.
 * Rotation is a new expiry.
 *
 * Guard: tests/unit/security/lead-claim-token-hashed.test.ts forbids reading or
 * writing the legacy plaintext `leads.claim_token` column.
 */
const TOKEN_DOMAIN = 'jovie:lead-claim-token:v1';

export interface LeadClaimTokenRow {
  readonly id: string;
  readonly claimTokenHash: string | null;
  readonly claimTokenExpiresAt: Date | null;
}

export function deriveLeadClaimToken(
  leadId: string,
  expiresAt: Date
): string | null {
  const secret = deriveSecret(TOKEN_DOMAIN);
  if (!secret) return null;
  const bytes = createHmac('sha256', secret)
    .update(`${leadId}:${expiresAt.getTime()}`)
    .digest()
    .subarray(0, 16);
  // UUID v4 shape, same as crypto.randomUUID(), so existing links and
  // validators keep working. 122 random bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The plaintext token for a lead, or null when none is stored, it expired, or
 * the stored hash belongs to a token that cannot be derived (a legacy random
 * token, or a rotated server secret).
 */
export async function resolveLeadClaimToken(
  lead: LeadClaimTokenRow,
  now = new Date()
): Promise<string | null> {
  if (!lead.claimTokenHash || !lead.claimTokenExpiresAt) return null;
  if (lead.claimTokenExpiresAt <= now) return null;
  const token = deriveLeadClaimToken(lead.id, lead.claimTokenExpiresAt);
  if (!token) return null;
  return (await hashClaimToken(token)) === lead.claimTokenHash ? token : null;
}

/** A fresh derivable pair. Fails closed when the signing secret is missing. */
export async function mintLeadClaimToken(
  leadId: string
): Promise<ClaimTokenPair> {
  const { expiresAt: rawExpiry } = await generateClaimTokenPair();
  // Whole seconds, so the expiry that derives the token survives the round trip.
  const expiresAt = new Date(Math.floor(rawExpiry.getTime() / 1000) * 1000);
  const token = deriveLeadClaimToken(leadId, expiresAt);
  if (!token) {
    throw new Error('Lead claim token signing secret is not configured');
  }
  return { token, tokenHash: await hashClaimToken(token), expiresAt };
}

export interface EnsuredLeadClaimToken extends ClaimTokenPair {
  readonly rotated: boolean;
}

/** Reuse the lead's current token, or mint one when it is missing or unusable. */
export async function ensureLeadClaimToken(
  lead: LeadClaimTokenRow,
  now = new Date()
): Promise<EnsuredLeadClaimToken> {
  const existing = await resolveLeadClaimToken(lead, now);
  if (existing && lead.claimTokenHash && lead.claimTokenExpiresAt) {
    return {
      token: existing,
      tokenHash: lead.claimTokenHash,
      expiresAt: lead.claimTokenExpiresAt,
      rotated: false,
    };
  }
  return { ...(await mintLeadClaimToken(lead.id)), rotated: true };
}

/**
 * Store a token's hash on the lead and, so the link we send resolves, on its
 * unclaimed profile. Never writes the plaintext.
 */
export async function persistLeadClaimToken(
  leadId: string,
  creatorProfileId: string | null,
  pair: ClaimTokenPair
): Promise<void> {
  const now = new Date();
  await db
    .update(leads)
    .set({
      claimTokenHash: pair.tokenHash,
      claimTokenExpiresAt: pair.expiresAt,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId));
  if (creatorProfileId) {
    await db
      .update(creatorProfiles)
      .set({
        claimToken: pair.tokenHash,
        claimTokenExpiresAt: pair.expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorProfiles.id, creatorProfileId),
          eq(creatorProfiles.isClaimed, false)
        )
      );
  }
}
