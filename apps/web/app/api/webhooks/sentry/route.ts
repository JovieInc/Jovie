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

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

    const issueId = String(issue.id);
    const title = issue.title || 'Unknown error';
    const culprit = issue.culprit || '';
    const message = issue.metadata?.value || issue.message || '';
    const url = issue.permalink || `https://sentry.io/issues/${issueId}/`;

    // Extract stack trace from first exception if available
    const frames =
      issue.metadata?.stacktrace?.frames ||
      payload.data?.issue?.platform_context?.stacktrace?.frames;
    const stacktrace = frames
      ? frames
          .slice(-10)
          .map(
            (f: { filename?: string; function?: string; lineno?: number }) =>
              `  ${f.filename || '?'}:${f.lineno || '?'} in ${f.function || '?'}`
          )
          .join('\n')
      : '';

    // Fire GitHub repository_dispatch
    const owner = process.env.VERCEL_GIT_REPO_OWNER || 'TheBlackFuture';
    const repo = process.env.VERCEL_GIT_REPO_SLUG || 'Jovie';

    const dispatchResponse = await fetch(
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
            title,
            culprit,
            message,
            url,
            stacktrace,
          },
        }),
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();
      logger.error('[Sentry Webhook] GitHub dispatch failed', {
        status: dispatchResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: 'Dispatch failed' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('[Sentry Webhook] Dispatched autofix', {
      issueId,
      title,
      culprit,
    });

    return NextResponse.json(
      { received: true, dispatched: true },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
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
