/**
 * Voice Pipeline Webhook Receiver (gh-9810)
 *
 * Receives async completion / status events from ElevenLabs (voice cloning,
 * generation, etc.) and other voice providers. Acts as the reliable ingress
 * for the async voice pipeline.
 *
 * Security & Idempotency (follows sentry/linear exactly per gstack P3/P4/P5):
 * - HMAC-SHA256 signature verification (ELEVENLABS_WEBHOOK_SECRET)
 *   using timingSafeEqual. Header: `elevenlabs-signature` (or override via env).
 * - Dedupe via acquireRecentDispatch (Redis-backed 60s lock per event id).
 * - Structured logging + critical error capture.
 *
 * Flow:
 *   11Labs (or future provider) → POST /api/webhooks/voice-pipeline
 *     → verify → dedupe → acknowledge (200) → (future: enqueue job record
 *       or trigger immediate processor step)
 *
 * The paired cron /api/cron/voice-pipeline can be used for scheduled sweeps
 * of any pending voice work that wasn't event-driven.
 *
 * Config: Set ELEVENLABS_WEBHOOK_SECRET in env (from 11Labs dashboard
 * webhook settings). Add the webhook URL in 11Labs project settings.
 *
 * References:
 * - gstack 6 principles (completeness, boil lakes, pragmatic reuse, explicit)
 * - Existing: apps/web/app/api/webhooks/sentry/route.ts
 * - Existing: apps/web/app/api/webhooks/linear/route.ts
 * - Processor pattern: apps/web/app/api/cron/process-ingestion-jobs/route.ts
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  acquireRecentDispatch,
  clearRecentDispatch,
} from '@/lib/webhooks/recent-dispatch';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const DEDUPE_TTL_SECONDS = 60;
const HEX_SIGNATURE_PATTERN = /^[0-9a-f]+$/i;

interface VoicePipelineWebhookPayload {
  id?: string; // event or job id for dedupe
  type?: string; // e.g. 'voice_generation.completed', 'voice_cloning.completed'
  status?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function normalizeSignature(signature: string): string | null {
  const normalized = signature
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (!HEX_SIGNATURE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const normalizedSignature = normalizeSignature(signature);
  if (!normalizedSignature) {
    return false;
  }

  try {
    const expectedBuffer = createHmac('sha256', secret).update(body).digest();
    const providedBuffer = Buffer.from(normalizedSignature, 'hex');
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function getEventId(payload: VoicePipelineWebhookPayload): string {
  if (typeof payload.id === 'string' && payload.id.length > 0) {
    return payload.id;
  }

  if (payload.data && typeof payload.data.id === 'string') {
    return payload.data.id;
  }

  return `evt_${Date.now()}`;
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.ELEVENLABS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn('[Voice Pipeline Webhook] Missing ELEVENLABS_WEBHOOK_SECRET');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  let dedupeAcquired = false;
  let dedupeKey: string | null = null;

  try {
    const body = await request.text();
    // Support common 11Labs header name; fall back to generic
    const signature =
      request.headers.get('elevenlabs-signature') ||
      request.headers.get('x-elevenlabs-signature') ||
      request.headers.get('xi-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!verifySignature(body, signature, webhookSecret)) {
      await captureCriticalError(
        'Invalid voice pipeline webhook signature',
        new Error('Signature verification failed'),
        { route: '/api/webhooks/voice-pipeline' }
      );
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let payload: VoicePipelineWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      logger.info('[Voice Pipeline Webhook] Non-JSON payload received');
      return NextResponse.json(
        { received: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    const eventId = getEventId(payload);

    dedupeKey = eventId;

    // Dedupe across instances (prevents double-processing on retries)
    const dedupeResult = await acquireRecentDispatch(
      'voice-pipeline',
      eventId,
      DEDUPE_TTL_SECONDS
    );

    if (!dedupeResult.acquired) {
      if (dedupeResult.reason === 'duplicate') {
        logger.info('[Voice Pipeline Webhook] Duplicate event ignored', {
          eventId,
          type: payload.type,
        });
        return NextResponse.json(
          { received: true, deduped: true },
          { headers: NO_STORE_HEADERS }
        );
      }
      // backend unavailable in prod → 503 so provider retries
      return NextResponse.json(
        { error: 'Temporary processing error' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    dedupeAcquired = true;

    logger.info('[Voice Pipeline Webhook] Event received', {
      eventId,
      type: payload.type,
      status: payload.status,
    });

    // Clear dedupe lock on success path (failure paths leave it to expire)
    await clearRecentDispatch('voice-pipeline', eventId).catch(() => {
      /* best-effort */
    });

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error('[Voice Pipeline Webhook] Unhandled error', {
      error: err instanceof Error ? err.message : String(err),
    });
    await captureCriticalError(
      'Voice pipeline webhook handler crashed',
      err instanceof Error ? err : new Error(String(err)),
      { route: '/api/webhooks/voice-pipeline' }
    );

    if (dedupeAcquired && dedupeKey) {
      await clearRecentDispatch('voice-pipeline', dedupeKey).catch(() => {
        /* best-effort */
      });
    }

    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
