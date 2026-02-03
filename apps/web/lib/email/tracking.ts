/**
 * Email Tracking Utilities
 *
 * Functions for generating and verifying email tracking tokens.
 * Used for open/click tracking in email campaigns.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { BASE_URL } from '@/constants/domains';
import { db } from '@/lib/db';
import {
  type EmailEngagementEventType,
  type EmailEngagementMetadata,
  emailEngagement,
  type TrackedEmailType,
} from '@/lib/db/schema/email-engagement';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * Secret key for signing tracking tokens.
 * Derived from the RESEND_API_KEY to avoid adding a new env variable.
 */
function getTrackingSecret(): string | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  // Use a different derivation than unsubscribe tokens
  return createHash('sha256')
    .update(`tracking:${apiKey}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Hash an email address for privacy-preserving storage.
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Tracking token payload
 */
export interface TrackingTokenPayload {
  /** Type of email being tracked */
  emailType: TrackedEmailType;
  /** Reference ID (e.g., invite ID, campaign ID) */
  referenceId: string;
  /** Recipient email (for verification) */
  email: string;
  /** Provider message ID (optional) */
  messageId?: string;
}

/**
 * Generate a tracking token for an email.
 * Token format: base64url(payload).hmac
 */
export function generateTrackingToken(
  payload: TrackingTokenPayload
): string | null {
  const secret = getTrackingSecret();
  if (!secret) {
    return null;
  }

  const data = JSON.stringify({
    t: payload.emailType,
    r: payload.referenceId,
    e: payload.email.toLowerCase().trim(),
    m: payload.messageId,
  });

  const dataBase64 = Buffer.from(data).toString('base64url');
  const hmac = createHmac('sha256', secret)
    .update(dataBase64)
    .digest('hex')
    .slice(0, 16);

  return `${dataBase64}.${hmac}`;
}

/**
 * Verify and decode a tracking token.
 * Returns the payload if valid, null otherwise.
 */
export function verifyTrackingToken(
  token: string
): TrackingTokenPayload | null {
  try {
    const [dataBase64, providedHmac] = token.split('.');
    if (!dataBase64 || !providedHmac) return null;

    const secret = getTrackingSecret();
    if (!secret) return null;

    const expectedHmac = createHmac('sha256', secret)
      .update(dataBase64)
      .digest('hex')
      .slice(0, 16);

    // Use timing-safe comparison
    const providedBuffer = Buffer.from(providedHmac, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    const data = JSON.parse(Buffer.from(dataBase64, 'base64url').toString());

    return {
      emailType: data.t as TrackedEmailType,
      referenceId: data.r,
      email: data.e,
      messageId: data.m,
    };
  } catch {
    return null;
  }
}

/**
 * Build a tracking pixel URL for open tracking.
 */
export function buildOpenTrackingUrl(
  payload: TrackingTokenPayload
): string | null {
  const token = generateTrackingToken(payload);
  if (!token) return null;
  return `${BASE_URL}/api/email/track/open?t=${encodeURIComponent(token)}`;
}

/**
 * Build a click tracking URL that wraps the original URL.
 */
export function buildClickTrackingUrl(
  payload: TrackingTokenPayload,
  targetUrl: string,
  linkId?: string
): string | null {
  const token = generateTrackingToken(payload);
  if (!token) return null;

  const params = new URLSearchParams({
    t: token,
    u: targetUrl,
  });

  if (linkId) {
    params.set('l', linkId);
  }

  return `${BASE_URL}/api/email/track/click?${params.toString()}`;
}

/**
 * Record an email engagement event.
 */
export async function recordEngagement(params: {
  emailType: TrackedEmailType;
  eventType: EmailEngagementEventType;
  referenceId: string;
  recipientEmail: string;
  providerMessageId?: string;
  metadata?: EmailEngagementMetadata;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const recipientHash = hashEmail(params.recipientEmail);

  try {
    // For opens, use upsert to only count first open
    if (params.eventType === 'open') {
      const [result] = await db
        .insert(emailEngagement)
        .values({
          emailType: params.emailType,
          eventType: params.eventType,
          referenceId: params.referenceId,
          recipientHash,
          providerMessageId: params.providerMessageId,
          metadata: params.metadata ?? {},
        })
        .onConflictDoNothing()
        .returning({ id: emailEngagement.id });

      if (!result) {
        // Already recorded this open
        return { success: true };
      }

      return { success: true, id: result.id };
    }

    // For clicks, record every click
    const [result] = await db
      .insert(emailEngagement)
      .values({
        emailType: params.emailType,
        eventType: params.eventType,
        referenceId: params.referenceId,
        recipientHash,
        providerMessageId: params.providerMessageId,
        metadata: params.metadata ?? {},
      })
      .returning({ id: emailEngagement.id });

    return { success: true, id: result?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[recordEngagement] Failed to record engagement', {
      error: message,
      emailType: params.emailType,
      eventType: params.eventType,
      referenceId: params.referenceId,
    });
    return { success: false, error: message };
  }
}

/**
 * Get engagement stats for a specific reference (e.g., invite or campaign).
 */
export async function getEngagementStats(referenceId: string): Promise<{
  opens: number;
  clicks: number;
  uniqueOpens: number;
  uniqueClicks: number;
}> {
  const results = await db
    .select({
      eventType: emailEngagement.eventType,
      recipientHash: emailEngagement.recipientHash,
    })
    .from(emailEngagement)
    .where(
      // Use eq from drizzle - import needed
      (await import('drizzle-orm')).eq(emailEngagement.referenceId, referenceId)
    );

  const opens = results.filter(r => r.eventType === 'open').length;
  const clicks = results.filter(r => r.eventType === 'click').length;
  const uniqueOpens = new Set(
    results.filter(r => r.eventType === 'open').map(r => r.recipientHash)
  ).size;
  const uniqueClicks = new Set(
    results.filter(r => r.eventType === 'click').map(r => r.recipientHash)
  ).size;

  return { opens, clicks, uniqueOpens, uniqueClicks };
}
