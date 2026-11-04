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
