/**
 * Sentry Webhook Handler
 * Receives Sentry issue alerts and triggers GitHub repository_dispatch
 * to kick off the automated Claude Code autofix workflow.
 *
 * Security:
 * - Verifies webhook signature using HMAC-SHA256 (sentry-hook-signature header)
 * - Uses timing-safe comparison to prevent timing attacks
 *
 * Flow:
 * Sentry alert → this endpoint → GitHub repository_dispatch → sentry-autofix.yml
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { captureCriticalError } from '@/lib/error-tracking';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import { isTransientInfraHttpIssue } from '@/lib/sentry/non-actionable-issues';
import { logger } from '@/lib/utils/logger';
import {
  acquireRecentDispatch,
  clearRecentDispatch,
} from '@/lib/webhooks/recent-dispatch';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const DEDUPE_TTL_SECONDS = 60;
const DISPATCH_TIMEOUT_MS = 10000;
const MAX_CONTEXT_LENGTH = 256;

/** Stack frame from Sentry payload */
interface SentryFrame {
  filename?: string;
  function?: string;
  lineno?: number;
}

interface RootCauseContext {
  project: string;
  environment: string;
  title: string;
  culprit: string;
  frames?: SentryFrame[];
}

function boundedString(value: unknown, maxLength = MAX_CONTEXT_LENGTH): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizeSignaturePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildRootCauseKey({
  project,
  environment,
  title,
  culprit,
  frames,
}: RootCauseContext): string {
  const topFrame = frames?.[frames.length - 1];
  const signature = [
    project || 'unknown-project',
    environment || 'unknown-environment',
    title,
    culprit,
    boundedString(topFrame?.filename, 512),
    boundedString(topFrame?.function, 256),
  ]
    .map(normalizeSignaturePart)
    .join('|');

  return `root-${createHash('sha256').update(signature).digest('hex').slice(0, 20)}`;
}

/**
 * Verify Sentry webhook signature.
 * Sentry sends `sentry-hook-signature` = HMAC-SHA256 hex digest of raw body.
 */
function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return (
      sigBuffer.length === expectedBuffer.length &&
      timingSafeEqual(sigBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.SENTRY_WEBHOOK_SECRET;
  const dispatchToken = env.GH_DISPATCH_TOKEN;

  if (!webhookSecret || !dispatchToken) {
    logger.warn(
      '[Sentry Webhook] Missing SENTRY_WEBHOOK_SECRET or GH_DISPATCH_TOKEN'
    );
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  let dedupeAcquired = false;
  let dedupeKeyForClear: string | null = null;

  try {
    const body = await request.text();
    const signature = request.headers.get('sentry-hook-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!verifySignature(body, signature, webhookSecret)) {
      await captureCriticalError(
        'Invalid Sentry webhook signature',
        new Error('Signature verification failed'),
        { route: '/api/webhooks/sentry' }
      );
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const payload = JSON.parse(body);

    // Extract issue details from Sentry alert payload
    const issue = payload.data?.issue;
    if (!issue) {
      logger.info('[Sentry Webhook] Non-issue event received, ignoring');
      return NextResponse.json(
        { received: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    const issueId = boundedString(issue.id, 64);
    const event = payload.data?.event || payload.event || {};
    const title = boundedString(issue.title) || 'Unknown error';
    const culprit = boundedString(issue.culprit);
    const message = boundedString(issue.metadata?.value || issue.message, 1000);
    const url =
      boundedString(issue.permalink, 1000) ||
      `https://sentry.io/issues/${issueId}/`;

    // Extract stack trace from first exception if available.
    const frames: SentryFrame[] | undefined =
      issue.metadata?.stacktrace?.frames ||
      issue.platform_context?.stacktrace?.frames ||
      event.exception?.values?.[0]?.stacktrace?.frames;
    const project = boundedString(
      issue.project?.slug || payload.data?.project?.slug || payload.project
    );
    const environment = boundedString(
      event.environment || issue.environment,
      64
    );
    const release = boundedString(event.release || issue.release, 128);
    const route = boundedString(event.transaction || culprit);
    const level = boundedString(event.level || issue.level, 32);
    const eventId = boundedString(event.event_id || event.id, 64);
    const firstSeen = boundedString(issue.firstSeen, 64);
    const lastSeen = boundedString(issue.lastSeen, 64);
    const eventCount = boundedString(issue.count, 32);
    const userCount = boundedString(issue.userCount, 32);
    const dedupeKey = buildRootCauseKey({
      project,
      environment,
      title,
      culprit,
      frames,
    });
    dedupeKeyForClear = dedupeKey;

    // Dedupe equivalent reports by a bounded, non-PII root signature. The
    // issue ID is still forwarded for direct Sentry linkage.
    const dedupeResult = await acquireRecentDispatch(
      'sentry',
      dedupeKey,
      DEDUPE_TTL_SECONDS
    );
    dedupeAcquired = dedupeResult.acquired;

    if (dedupeResult.reason === 'backend_unavailable') {
      await captureCriticalError(
        'Sentry webhook dedupe backend unavailable',
        new Error('Redis unavailable for webhook dedupe'),
        { route: '/api/webhooks/sentry', issueId }
      );
      return NextResponse.json(
        { error: 'Webhook dedupe unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    if (!dedupeAcquired) {
      logger.info('[Sentry Webhook] Duplicate dispatch suppressed', {
        issueId,
        dedupeKey,
      });
      return NextResponse.json(
        { received: true, deduplicated: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (isTransientInfraHttpIssue({ title, culprit })) {
      logger.info(
        '[Sentry Webhook] Skipping autofix for transient infra HTTP issue',
        { issueId, title, culprit }
      );
      return NextResponse.json(
        { received: true, skipped: true, reason: 'transient-infra-http' },
        { headers: NO_STORE_HEADERS }
      );
    }

    const stacktrace = frames
      ? frames
          .slice(-10)
          .map(
            (f: SentryFrame) =>
              `  ${boundedString(f.filename, 512) || '?'}:${boundedString(f.lineno, 16) || '?'} in ${boundedString(f.function, 256) || '?'}`
          )
          .join('\n')
      : '';

    // Fire GitHub repository_dispatch
    // Canonical product repo. Never fall back to a legacy org/name — silent misfires.
    const owner = env.VERCEL_GIT_REPO_OWNER || 'JovieInc';
    const repo = env.VERCEL_GIT_REPO_SLUG || 'Jovie';

    const dispatchResponse = await serverFetch(
      `https://api.github.com/repos/${owner}/${repo}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${dispatchToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'sentry-issue',
          client_payload: {
            issue_id: issueId,
            dedupe_key: dedupeKey,
            title,
            culprit,
            message,
            url,
            stacktrace,
            context: {
              root_cause_fingerprint: dedupeKey,
              environment,
              release,
              project,
              route,
              level,
              event_id: eventId,
              first_seen: firstSeen,
              last_seen: lastSeen,
              event_count: eventCount,
              user_count: userCount,
            },
          },
        }),
        timeoutMs: DISPATCH_TIMEOUT_MS,
        context: 'GitHub repository dispatch for Sentry webhook',
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();
      logger.error('[Sentry Webhook] GitHub dispatch failed', {
        status: dispatchResponse.status,
        error: errorText,
      });
      await clearRecentDispatch('sentry', dedupeKey);
      return NextResponse.json(
        { error: 'Dispatch failed' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('[Sentry Webhook] Dispatched autofix', {
      issueId,
      dedupeKey,
      title,
      culprit,
    });

    return NextResponse.json(
      { received: true, dispatched: true },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (dedupeAcquired && dedupeKeyForClear) {
      await clearRecentDispatch('sentry', dedupeKeyForClear);
    }

    if (error instanceof ServerFetchTimeoutError) {
      await captureCriticalError('Sentry webhook dispatch timed out', error, {
        route: '/api/webhooks/sentry',
        timeoutMs: error.timeoutMs,
      });
      return NextResponse.json(
        { error: 'Dispatch timed out' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    await captureCriticalError('Sentry webhook processing failed', error, {
      route: '/api/webhooks/sentry',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
