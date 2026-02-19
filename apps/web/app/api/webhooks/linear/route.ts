import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Best-effort dedup for burst protection within a single serverless instance.
// This Map does NOT persist across cold starts or different instances — it only
// prevents duplicate GitHub dispatches when Linear sends rapid-fire retries to
// the same warm instance (common within a ~60s window).
const recentDispatches = new Map<string, number>();
const DEDUPE_TTL_MS = 60_000;

interface LinearIssueState {
  id?: string;
  name?: string;
  type?: string;
}

interface LinearIssueData {
  id?: string;
  identifier?: string;
  title?: string;
  description?: string;
  url?: string;
  updatedAt?: string;
  team?: {
    key?: string;
  };
  state?: LinearIssueState;
  stateId?: string;
}

interface LinearWebhookPayload {
  action?: string;
  type?: string;
  createdAt?: string;
  data?: LinearIssueData;
  updatedFrom?: {
    stateId?: string;
  };
}

function isDuplicate(dedupeKey: string): boolean {
  const now = Date.now();
  for (const [key, ts] of recentDispatches) {
    if (now - ts > DEDUPE_TTL_MS) {
      recentDispatches.delete(key);
    }
  }
  return recentDispatches.has(dedupeKey);
}

function markDispatched(dedupeKey: string): void {
  recentDispatches.set(dedupeKey, Date.now());
}

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

function isTodoTransition(payload: LinearWebhookPayload): boolean {
  if (payload.type !== 'Issue' || payload.action !== 'update') {
    return false;
  }

  const stateName = payload.data?.state?.name?.trim().toLowerCase();
  const stateType = payload.data?.state?.type?.trim().toLowerCase();
  const previousStateId = payload.updatedFrom?.stateId;
  const currentStateId = payload.data?.stateId;

  const isTodoName = stateName === 'todo';
  const isUnstartedType = stateType === 'unstarted';
  const changedState =
    typeof previousStateId === 'string' &&
    typeof currentStateId === 'string' &&
    previousStateId !== currentStateId;

  return changedState && (isTodoName || isUnstartedType);
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.LINEAR_WEBHOOK_SECRET;
  const dispatchToken = env.GH_DISPATCH_TOKEN;

  if (!webhookSecret || !dispatchToken) {
    logger.warn(
      '[Linear Webhook] Missing LINEAR_WEBHOOK_SECRET or GH_DISPATCH_TOKEN'
    );
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('linear-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!verifySignature(body, signature, webhookSecret)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const payload = JSON.parse(body) as LinearWebhookPayload;

    if (!isTodoTransition(payload)) {
      return NextResponse.json(
        { received: true, ignored: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    const issueId = payload.data?.id;
    if (!issueId) {
      return NextResponse.json(
        { error: 'Missing issue id in payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const dedupeKey = `${issueId}:${payload.data?.updatedAt ?? payload.createdAt ?? ''}`;
    if (isDuplicate(dedupeKey)) {
      return NextResponse.json(
        { received: true, deduplicated: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    const owner = process.env.VERCEL_GIT_REPO_OWNER ?? 'TheBlackFuture';
    const repo = process.env.VERCEL_GIT_REPO_SLUG ?? 'Jovie';

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
          event_type: 'linear_todo_ready',
          client_payload: {
            issue_id: issueId,
            issue_identifier: payload.data?.identifier ?? null,
            issue_title: payload.data?.title ?? 'Untitled Linear Issue',
            issue_description: payload.data?.description ?? '',
            issue_url: payload.data?.url ?? null,
            issue_updated_at: payload.data?.updatedAt ?? null,
            team_key: payload.data?.team?.key ?? null,
            state_name: payload.data?.state?.name ?? null,
          },
        }),
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();
      logger.error('[Linear Webhook] GitHub dispatch failed', {
        issueId,
        status: dispatchResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: 'Dispatch failed' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    markDispatched(dedupeKey);

    return NextResponse.json(
      { received: true, dispatched: true },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError('Linear webhook processing failed', error, {
      route: '/api/webhooks/linear',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
