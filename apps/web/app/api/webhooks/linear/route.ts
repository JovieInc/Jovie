import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

interface LinearCommentUser {
  name?: string;
  displayName?: string;
}

interface LinearCommentData {
  id?: string;
  body?: string;
  issue?: LinearIssueData;
  user?: LinearCommentUser;
}

interface LinearWebhookPayload {
  action?: string;
  type?: string;
  createdAt?: string;
  data?: LinearIssueData | LinearCommentData;
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

  const issueData = payload.data as LinearIssueData | undefined;
  const stateName = issueData?.state?.name?.trim().toLowerCase();
  const stateType = issueData?.state?.type?.trim().toLowerCase();
  const previousStateId = payload.updatedFrom?.stateId;
  const currentStateId = issueData?.stateId;

  const isTodoName = stateName === 'todo';
  const isUnstartedType = stateType === 'unstarted';
  const changedState =
    typeof previousStateId === 'string' &&
    typeof currentStateId === 'string' &&
    previousStateId !== currentStateId;

  return changedState && (isTodoName || isUnstartedType);
}

function isCodeRabbitPlanComment(payload: LinearWebhookPayload): boolean {
  if (payload.type !== 'Comment' || payload.action !== 'create') {
    return false;
  }

  const commentData = payload.data as LinearCommentData | undefined;
  const author =
    commentData?.user?.name?.trim().toLowerCase() ??
    commentData?.user?.displayName?.trim().toLowerCase() ??
    '';
  const body = commentData?.body ?? '';

  const isCodeRabbitAuthor = author.includes('coderabbit');
  const hasPlanMarker =
    /coderabbit-plan-ready|##\s+Implementation\s+Plan/i.test(body);

  return isCodeRabbitAuthor && hasPlanMarker;
}

function getIssueData(
  payload: LinearWebhookPayload
): LinearIssueData | undefined {
  if (payload.type === 'Comment') {
    return (payload.data as LinearCommentData | undefined)?.issue;
  }

  return payload.data as LinearIssueData | undefined;
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

    const isTodoReadyEvent = isTodoTransition(payload);
    const isPlanReadyEvent = isCodeRabbitPlanComment(payload);

    if (!isTodoReadyEvent && !isPlanReadyEvent) {
      return NextResponse.json(
        { received: true, ignored: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    const issueData = getIssueData(payload);
    const issueId = issueData?.id;
    if (!issueId) {
      return NextResponse.json(
        { error: 'Missing issue id in payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const dedupeKey = `${issueId}:${issueData?.updatedAt ?? payload.createdAt ?? ''}:${isPlanReadyEvent ? 'plan' : 'todo'}`;
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
          event_type: isPlanReadyEvent
            ? 'linear_plan_ready'
            : 'linear_todo_ready',
          client_payload: {
            issue_id: issueId,
            issue_identifier: issueData?.identifier ?? null,
            issue_title: issueData?.title ?? 'Untitled Linear Issue',
            issue_description: issueData?.description ?? '',
            issue_url: issueData?.url ?? null,
            issue_updated_at: issueData?.updatedAt ?? null,
            team_key: issueData?.team?.key ?? null,
            state_name: issueData?.state?.name ?? null,
            plan_ready: isPlanReadyEvent,
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
