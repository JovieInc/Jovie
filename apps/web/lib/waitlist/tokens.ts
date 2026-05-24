import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const WAITLIST_INVITE_TOKEN_BYTES = 32;
export const WAITLIST_INVITE_EXPIRES_DAYS = 14;

export interface WaitlistInviteTokenPair {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashWaitlistInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateWaitlistInviteTokenPair(
  now: Date = new Date()
): WaitlistInviteTokenPair {
  const token = randomBytes(WAITLIST_INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + WAITLIST_INVITE_EXPIRES_DAYS);

  return {
    token,
    tokenHash: hashWaitlistInviteToken(token),
    expiresAt,
  };
}

export function waitlistInviteTokenMatches(
  providedToken: string,
  storedHash: string
): boolean {
  const providedHash = hashWaitlistInviteToken(providedToken);
  const provided = Buffer.from(providedHash, 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (provided.length !== stored.length) return false;
  return timingSafeEqual(provided, stored);
}
