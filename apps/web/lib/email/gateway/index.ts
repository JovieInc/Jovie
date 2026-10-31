import 'server-only';

/**
 * The send gateway: every email Jovie sends goes through sendStreamEmail.
 *
 * Each message declares a stream (stream-registry.json). The registry binds
 * the stream to its provider, sending domain and address, reply-to, required
 * headers, postal footer, consent bases, suppression scope, hourly limit,
 * approval requirement and deliverability thresholds. Callers never choose a
 * provider or a sender address. Cold is closed until Tim approves a path, and
 * never runs on jov.ie or the Resend transactional account.
 *
 * CI enforcement: scripts/lib/external-api-guard.mjs (mail rules) fails on a
 * mail SDK import, a mail provider host, SMTP or a hardcoded sender outside
 * this directory.
 */
import { LEGAL_ENTITY_NAME } from '@/constants/app';
import { captureError } from '@/lib/error-tracking';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { getSummerCard } from '@/lib/ovie/summer-cards.server';
import { createRateLimiter, type RateLimiter } from '@/lib/rate-limit';
import { getEmailSendBlockReason } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import type { EmailStream } from '../streams';
import { type GatewayDeps, runGateway, type StreamSendResult } from './core';
import { readStreamPause } from './pause.server';
import type { StreamEmailRequest } from './policy';
import { resendTransport } from './resend-transport';

export type { StreamSendResult } from './core';
export type { StreamEmailRequest } from './policy';
export { EmailPolicyError } from './policy';

const limiters = new Map<EmailStream, RateLimiter>();

/**
 * Report each quota pressure level at most once per UTC day per instance.
 * Noise control only: the structured log line still fires on every send.
 */
const reportedQuota = new Set<string>();
export function shouldReportQuota(
  pressure: string,
  now: Date = new Date()
): boolean {
  const key = `${pressure}:${now.toISOString().slice(0, 10)}`;
  if (reportedQuota.has(key)) return false;
  if (reportedQuota.size > 32) reportedQuota.clear();
  reportedQuota.add(key);
  return true;
}

function limiterFor(stream: EmailStream, perHour: number): RateLimiter {
  let limiter = limiters.get(stream);
  if (!limiter) {
    limiter = createRateLimiter({
      name: `Email stream ${stream}`,
      limit: Math.max(perHour, 1),
      window: '1 h',
      prefix: `email_stream_${stream}`,
      analytics: false,
      algorithm: 'sliding-window',
      trafficClass: 'internal',
    });
    limiters.set(stream, limiter);
  }
  return limiter;
}

function productionDeps(): GatewayDeps {
  return {
    env: process.env,
    mailingAddress: process.env.LEGAL_MAILING_ADDRESS?.trim() || null,
    entityName: LEGAL_ENTITY_NAME,
    transport: resendTransport,
    testRecipientBlock: getEmailSendBlockReason,
    async readPause(stream) {
      try {
        return await readStreamPause(stream);
      } catch (error) {
        // Unknown pause state: fail closed for pausable streams.
        await captureError('[email-gateway] pause read failed', error, {
          stream,
        });
        return { reason: 'pause state unreadable' };
      }
    },
    async cardStatus(cardId) {
      const card = await getSummerCard(cardId);
      if (!card) return 'missing';
      if (card.kind !== 'outbound') return 'missing';
      return card.status;
    },
    async suppression(to) {
      const check = await isEmailSuppressed(to);
      return check.suppressed
        ? { suppressed: true, reason: check.reason ?? 'unknown' }
        : { suppressed: false };
    },
    async rateLimited(stream, perHour) {
      if (perHour <= 0) return true;
      const result = await limiterFor(stream, perHour).limit(stream);
      return !result.success && !result.unavailable;
    },
    record(event) {
      logger.info('email_gateway_send', event);
    },
    onViolation(error, context) {
      void captureError('[email-gateway] policy violation', error, context);
    },
    onQuotaPressure(reading, stream) {
      // Warn-level event: the capacity loop and Summer read it; at
      // 'exhausted' sign-in codes are failing, so it reports as an error.
      logger.warn('email_gateway_quota_pressure', { stream, ...reading });
      if (!shouldReportQuota(reading.pressure)) return;
      void captureError(
        `[email-gateway] provider quota ${reading.pressure}`,
        new Error(
          `Resend quota ${reading.pressure}: daily ${reading.dailyUsed ?? '?'}/${reading.dailyLimit ?? '?'}, monthly ${reading.monthlyUsed ?? '?'}/${reading.monthlyLimit ?? '?'}`
        ),
        { stream, pressure: reading.pressure, usedFrac: reading.usedFrac },
        reading.pressure === 'exhausted' ? 'error' : 'warning'
      );
    },
  };
}

/** Send one email on a declared stream. Never throws; read `status`. */
export async function sendStreamEmail(
  request: StreamEmailRequest,
  deps: GatewayDeps = productionDeps()
): Promise<StreamSendResult> {
  try {
    return await runGateway(request, deps);
  } catch (error) {
    await captureError('[email-gateway] send failed', error, {
      stream: request.stream,
      purpose: request.purpose,
    });
    return {
      status: 'error',
      stream: request.stream,
      error: error instanceof Error ? error.message : 'Unknown gateway error',
    };
  }
}
