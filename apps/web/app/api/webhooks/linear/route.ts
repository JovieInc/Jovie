/**
 * Linear Webhook Handler
 *
 * Invariant consumer: JOV-INV-005.
 *
 * Bridges signed Linear changes to bounded GitHub repository_dispatch events:
 * CodeRabbit plan comments become `linear_plan_ready`; JOV Issue changes in
 * Triage become `linear_triage_assess` for a trusted exact-issue reread;
 * validation receipts and terminal founder work results on JOV issues become `linear_validation_receipt`
 * (Linear Sync on Merge re-evaluates the lifecycle); a JOV issue that gains
 * a Quality Gap Finder input label (post-mortem action or escaped defect), or
 * closes while carrying one, becomes `quality-gap-scan`. These are the events
 * those workflows used to catch on a clock.
 *
 * Issue pickup is owned by upstream OpenAI Symphony. The Triage event is
 * an assessment wake-up, not an admission or worker dispatch.
 *
 * Auth: HMAC-SHA256 verification against LINEAR_WEBHOOK_SECRET via the
 * `linear-signature` header. Missing → 400, invalid → 401.
 *
 * Dedupe: keyed digest of the verified webhook body held for six hours. Definite dispatch rejection releases the lock; an ambiguous
 * timeout stays locked for the reconciliation backstop instead of replaying.
 *
 * Side effects: POSTs to
 * `https://api.github.com/repos/{owner}/{repo}/dispatches` with
 * GH_DISPATCH_TOKEN. Repo defaults to JovieInc/Jovie unless
 * VERCEL_GIT_REPO_OWNER / VERCEL_GIT_REPO_SLUG override.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { extractWorkBlocks } from '@jovie/agent-transport-contracts/work-order';
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import {
  acquireRecentDispatch,
  clearRecentDispatch,
} from '@/lib/webhooks/recent-dispatch';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const DEDUPE_TTL_SECONDS = 6 * 60 * 60;
const DISPATCH_TIMEOUT_MS = 4500;
const LINEAR_ISSUE_READ_TIMEOUT_MS = 4500;
const LINEAR_ISSUE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROVIDER_EVENT_AGE_MS = 6 * 60 * 60 * 1000;
const JOV_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
const JOV_TRIAGE_STATE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const JOV_BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d';
const JOV_IDENTIFIER = /^JOV-\d+$/;
const VALIDATION_RECEIPT_MARKER = /<!--\s*validation-receipt:v1\b/;
// Mirrors DEFECT_LABELS plus `postmortem-action` in scripts/quality-gap-finder.mjs.
const QUALITY_GAP_INPUT_LABELS = new Set([
  'postmortem-action',
  'bug',
  'dogfood',
  'sentry',
  'intake',
  'escaped-defect',
]);
const CLOSED_STATE_TYPES = new Set(['completed', 'canceled']);

type LinearEventKind =
  | 'plan'
  | 'triage-assess'
  | 'validation-receipt'
  | 'quality-gap-input';

const DISPATCH_EVENT_TYPE: Record<LinearEventKind, string> = {
  plan: 'linear_plan_ready',
  'triage-assess': 'linear_triage_assess',
  'validation-receipt': 'linear_validation_receipt',
  'quality-gap-input': 'quality-gap-scan',
};

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
  priority?: number;
  teamId?: string;
  team?: {
    id?: string;
    key?: string;
  };
  state?: LinearIssueState;
  stateId?: string;
  labels?: Array<{ id?: string; name?: string }>;
}

interface LinearCommentUser {
  name?: string;
  displayName?: string;
}

interface LinearCommentData {
  id?: string;
  issueId?: string | null;
  projectId?: string | null;
  projectUpdateId?: string | null;
  documentContentId?: string | null;
  initiativeId?: string | null;
  initiativeUpdateId?: string | null;
  postId?: string | null;
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
    labelIds?: string[];
  };
  webhookId?: string;
  webhookTimestamp?: string | number;
}

interface AutomationContract {
  verifyRequired: boolean;
  simplifyBounded: boolean;
  modelTier: 'premium' | 'economy';
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

function isJovIssue(issue: LinearIssueData | undefined): boolean {
  return Boolean(
    issue?.id &&
      JOV_IDENTIFIER.test(issue.identifier ?? '') &&
      (issue.teamId === JOV_TEAM_ID || issue.team?.key === 'JOV')
  );
}

function admissionState(
  issue: LinearIssueData | undefined
): 'Triage' | 'Backlog' | null {
  if (
    issue?.stateId === JOV_TRIAGE_STATE_ID ||
    issue?.state?.id === JOV_TRIAGE_STATE_ID ||
    issue?.state?.name === 'Triage'
  )
    return 'Triage';
  if (
    issue?.stateId === JOV_BACKLOG_STATE_ID ||
    issue?.state?.id === JOV_BACKLOG_STATE_ID ||
    issue?.state?.name === 'Backlog'
  )
    return 'Backlog';
  return null;
}

function isJovAdmissionIssueChange(payload: LinearWebhookPayload): boolean {
  if (
    payload.type !== 'Issue' ||
    !['create', 'update'].includes(payload.action ?? '')
  ) {
    return false;
  }
  const issue = payload.data as LinearIssueData | undefined;
  if (!isJovIssue(issue)) return false;
  const state = admissionState(issue);
  if (state === 'Triage') return true;
  // This only requests a signed, current-state observation from the existing
  // writer. Priority, labels and titles never establish execution eligibility.
  return (
    state === 'Backlog' &&
    (issue?.priority === 1 ||
      issue?.labels?.some(label => label.name?.toLowerCase() === 'p0') ===
        true ||
      /^(?:P0\b|\[P0\])/i.test(issue?.title ?? '') ||
      (issue?.priority === 2 &&
        issue?.labels?.some(label => label.name === 'agent-ready') === true &&
        issue?.labels?.some(label => label.name === 'dispatch-next') === true))
  );
}

function isValidationReceiptCandidate(payload: LinearWebhookPayload): boolean {
  if (payload.type !== 'Comment' || payload.action !== 'create') return false;
  const comment = payload.data as LinearCommentData | undefined;
  const body = typeof comment?.body === 'string' ? comment.body : '';
  // This requests a trusted reread only. The lifecycle still validates the
  // order revision/digest, episode, actor and artifact before accepting it.
  const founderResult = extractWorkBlocks(body).results.some(result => {
    if (!result || typeof result !== 'object') return false;
    const actor = Reflect.get(result, 'actor');
    return (
      Reflect.get(result, 'phase') === 'terminal' &&
      actor &&
      typeof actor === 'object' &&
      Reflect.get(actor, 'class') === 'founder-decision'
    );
  });
  return VALIDATION_RECEIPT_MARKER.test(body) || Boolean(founderResult);
}

function isValidationReceiptComment(payload: LinearWebhookPayload): boolean {
  const comment = payload.data as LinearCommentData | undefined;
  return (
    isValidationReceiptCandidate(payload) &&
    Boolean(comment?.issue?.id) &&
    JOV_IDENTIFIER.test(comment?.issue?.identifier ?? '')
  );
}

/** Native Comment events carry issueId, not an expanded issue. Resolve only
 * receipt wake candidates; comment content never supplies lifecycle identity. */
async function hydrateValidationReceiptIssue(
  payload: LinearWebhookPayload
): Promise<boolean> {
  const comment = payload.data as LinearCommentData;
  const nonIssueParents = [
    comment.projectId,
    comment.projectUpdateId,
    comment.documentContentId,
    comment.initiativeId,
    comment.initiativeUpdateId,
    comment.postId,
  ].filter(value => value !== undefined && value !== null);
  if (nonIssueParents.length > 0) {
    // Native comments can belong to a project, update, document or post.
    // Ignore only a positively identified non-issue parent; conflicting or
    // malformed identities must remain retryable, never guessed from content.
    if (
      (comment.issueId === null || comment.issueId === undefined) &&
      !comment.issue &&
      nonIssueParents.every(
        parent => typeof parent === 'string' && LINEAR_ISSUE_ID.test(parent)
      )
    )
      return false;
    throw new Error('Linear Comment parent identity is ambiguous');
  }
  // Preserve the legacy expanded payload, including ignored non-JOV issues.
  if (
    comment.issueId === undefined &&
    typeof comment.issue?.id === 'string' &&
    comment.issue.id &&
    typeof comment.issue.identifier === 'string' &&
    comment.issue.identifier
  )
    return true;
  const issueId = comment.issueId;
  if (
    typeof issueId !== 'string' ||
    !LINEAR_ISSUE_ID.test(issueId) ||
    (comment.issue?.id && comment.issue.id !== issueId)
  ) {
    throw new Error('Linear Comment issue identity is invalid');
  }
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('Linear issue reader is unconfigured');
  const readIssue = async () => {
    const response = await serverFetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'query LinearWebhookIssue($id: String!) { issue(id: $id) { id identifier updatedAt team { id key } } }',
        variables: { id: issueId },
      }),
      redirect: 'error',
      timeoutMs: LINEAR_ISSUE_READ_TIMEOUT_MS,
      context: 'Linear webhook receipt issue read',
    });
    if (!response.ok) throw new Error('Linear issue read failed');
    return response.json();
  };
  // serverFetch bounds transport; this deadline also bounds response decoding.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let result: {
    errors?: unknown;
    data?: { issue?: LinearIssueData | null };
  } | null;
  try {
    result = await Promise.race([
      readIssue(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Linear issue read timed out')),
          LINEAR_ISSUE_READ_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
  const issue = result?.data?.issue;
  if (
    (result?.errors !== undefined &&
      (!Array.isArray(result.errors) || result.errors.length > 0)) ||
    !issue ||
    issue.id !== issueId ||
    typeof issue.identifier !== 'string' ||
    !/^[A-Z][A-Z0-9]*-[1-9]\d*$/.test(issue.identifier) ||
    typeof issue.team?.id !== 'string' ||
    !LINEAR_ISSUE_ID.test(issue.team.id) ||
    typeof issue.team.key !== 'string' ||
    (comment.issue?.identifier && comment.issue.identifier !== issue.identifier)
  ) {
    throw new Error('Linear issue read returned an invalid identity');
  }
  if (
    issue.team.id !== JOV_TEAM_ID ||
    issue.team.key !== 'JOV' ||
    !JOV_IDENTIFIER.test(issue.identifier)
  )
    return false;
  comment.issue = issue;
  return true;
}

function isQualityGapInputChange(payload: LinearWebhookPayload): boolean {
  if (payload.type !== 'Issue' || payload.action !== 'update') return false;
  const issue = payload.data as LinearIssueData | undefined;
  if (!isJovIssue(issue)) return false;
  const inputLabels = (issue?.labels ?? []).filter(label =>
    QUALITY_GAP_INPUT_LABELS.has(label.name ?? '')
  );
  if (inputLabels.length === 0) return false;
  const closed =
    Boolean(payload.updatedFrom?.stateId) &&
    CLOSED_STATE_TYPES.has(issue?.state?.type ?? '');
  const previousLabelIds = payload.updatedFrom?.labelIds;
  const gainedLabel =
    Array.isArray(previousLabelIds) &&
    inputLabels.some(label => !previousLabelIds.includes(label.id ?? ''));
  return closed || gainedLabel;
}

function classifyLinearEvent(
  payload: LinearWebhookPayload
): LinearEventKind | null {
  if (isCodeRabbitPlanComment(payload)) return 'plan';
  if (isValidationReceiptComment(payload)) return 'validation-receipt';
  if (isJovAdmissionIssueChange(payload)) return 'triage-assess';
  if (isQualityGapInputChange(payload)) return 'quality-gap-input';
  return null;
}

function getIssueData(
  payload: LinearWebhookPayload
): LinearIssueData | undefined {
  if (payload.type === 'Comment') {
    return (payload.data as LinearCommentData | undefined)?.issue;
  }

  return payload.data as LinearIssueData | undefined;
}

function parseAutomationContract(body: string): AutomationContract {
  const verifyMatch = /verify_required=(true|false)/i.exec(body)?.[1];
  const simplifyMatch = /simplify_bounded=(true|false)/i.exec(body)?.[1];
  const modelMatch = /model_tier=(premium|economy)/i.exec(body)?.[1];

  return {
    verifyRequired: verifyMatch?.toLowerCase() !== 'false',
    simplifyBounded: simplifyMatch?.toLowerCase() !== 'false',
    modelTier: modelMatch?.toLowerCase() === 'economy' ? 'economy' : 'premium',
  };
}

function getAutomationContract(
  payload: LinearWebhookPayload
): AutomationContract {
  const commentData = payload.data as LinearCommentData | undefined;
  return parseAutomationContract(commentData?.body ?? '');
}

function providerTimestamp(payload: LinearWebhookPayload): string | null {
  if (payload.webhookTimestamp === undefined) return null;
  const numeric = Number(payload.webhookTimestamp);
  const parsed = Number.isFinite(numeric)
    ? numeric < 10_000_000_000
      ? numeric * 1000
      : numeric
    : Date.parse(String(payload.webhookTimestamp));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function staleProviderEvent(
  timestamp: string | null,
  now = Date.now()
): boolean {
  if (!timestamp) return false;
  const observed = Date.parse(timestamp);
  return observed > now + 60_000 || now - observed > MAX_PROVIDER_EVENT_AGE_MS;
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

  let dedupeAcquired = false;
  let dedupeKeyForRetry: string | null = null;

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

    // Check freshness before an authoritative read. Lookup failures are reads,
    // never an ambiguous GitHub dispatch, and must leave the event retryable.
    if (isValidationReceiptCandidate(payload)) {
      const timestamp = providerTimestamp(payload);
      if (payload.webhookTimestamp !== undefined && !timestamp) {
        return NextResponse.json(
          { error: 'Invalid provider timestamp' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (staleProviderEvent(timestamp)) {
        return NextResponse.json(
          { received: true, ignored: true, reason: 'stale-provider-event' },
          { headers: NO_STORE_HEADERS }
        );
      }
      try {
        if (!(await hydrateValidationReceiptIssue(payload))) {
          return NextResponse.json(
            { received: true, ignored: true },
            { headers: NO_STORE_HEADERS }
          );
        }
      } catch (error) {
        await captureCriticalError(
          'Linear webhook receipt issue read failed',
          error,
          {
            route: '/api/webhooks/linear',
          }
        );
        return NextResponse.json(
          { error: 'Receipt issue lookup unavailable' },
          { status: 503, headers: NO_STORE_HEADERS }
        );
      }
    }

    const eventKind = classifyLinearEvent(payload);
    const isPlanReadyEvent = eventKind === 'plan';
    const isTriageEvent = eventKind === 'triage-assess';

    if (!eventKind) {
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

    const observedAt = providerTimestamp(payload);
    if (payload.webhookTimestamp !== undefined && !observedAt) {
      return NextResponse.json(
        { error: 'Invalid provider timestamp' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (staleProviderEvent(observedAt)) {
      return NextResponse.json(
        { received: true, ignored: true, reason: 'stale-provider-event' },
        { headers: NO_STORE_HEADERS }
      );
    }

    // The signature authenticates the body, not Linear-Delivery. A replay with
    // a changed header must remain the same event; distinct signed revisions
    // get independent keys. The keyed digest does not expose issue content.
    const authenticatedDeliveryId = createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    const dedupeKey = `${authenticatedDeliveryId}:${eventKind}`;
    dedupeKeyForRetry = dedupeKey;
    const dedupeResult = await acquireRecentDispatch(
      'linear',
      dedupeKey,
      DEDUPE_TTL_SECONDS
    );
    dedupeAcquired = dedupeResult.acquired;

    if (dedupeResult.reason === 'backend_unavailable') {
      await captureCriticalError(
        'Linear webhook dedupe backend unavailable',
        new Error('Redis unavailable for webhook dedupe'),
        { route: '/api/webhooks/linear', issueId }
      );
      return NextResponse.json(
        { error: 'Webhook dedupe unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    if (!dedupeAcquired) {
      return NextResponse.json(
        { received: true, deduplicated: true, eventId: dedupeKey },
        { headers: NO_STORE_HEADERS }
      );
    }

    const owner = env.VERCEL_GIT_REPO_OWNER ?? 'JovieInc';
    const repo = env.VERCEL_GIT_REPO_SLUG ?? 'Jovie';
    const automationContract = isPlanReadyEvent
      ? getAutomationContract(payload)
      : null;

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
          event_type: DISPATCH_EVENT_TYPE[eventKind],
          client_payload: {
            delivery_id: authenticatedDeliveryId,
            provider_timestamp: observedAt ?? payload.createdAt ?? null,
            issue_id: issueId,
            issue_identifier: issueData?.identifier ?? null,
            issue_updated_at: issueData?.updatedAt ?? null,
            team_key: isTriageEvent ? 'JOV' : (issueData?.team?.key ?? null),
            state_name: isTriageEvent
              ? admissionState(issueData)
              : (issueData?.state?.name ?? null),
            action: payload.action ?? null,
            ...(automationContract && {
              automation: {
                plan_ready: true,
                verify_required: automationContract.verifyRequired,
                simplify_bounded: automationContract.simplifyBounded,
                model_tier: automationContract.modelTier,
              },
            }),
          },
        }),
        timeoutMs: DISPATCH_TIMEOUT_MS,
        context: 'GitHub repository dispatch for Linear webhook',
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();
      logger.error('[Linear Webhook] GitHub dispatch failed', {
        issueId,
        status: dispatchResponse.status,
        error: errorText,
      });
      await clearRecentDispatch('linear', dedupeKey);
      return NextResponse.json(
        { error: 'Dispatch failed' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { received: true, dispatched: true, eventId: dedupeKey },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return handleLinearWebhookError(error, dedupeAcquired, dedupeKeyForRetry);
  }
}

async function handleLinearWebhookError(
  error: unknown,
  dedupeAcquired: boolean,
  dedupeKeyForRetry: string | null
): Promise<NextResponse> {
  if (error instanceof ServerFetchTimeoutError) {
    await captureCriticalError('Linear webhook dispatch timed out', error, {
      route: '/api/webhooks/linear',
      timeoutMs: error.timeoutMs,
    });
    return NextResponse.json(
      {
        received: true,
        dispatchState: 'ambiguous',
        reconcileRequired: true,
        eventId: dedupeKeyForRetry,
      },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  }

  if (dedupeAcquired && dedupeKeyForRetry) {
    await clearRecentDispatch('linear', dedupeKeyForRetry);
  }

  await captureCriticalError('Linear webhook processing failed', error, {
    route: '/api/webhooks/linear',
  });
  return NextResponse.json(
    { error: 'Webhook processing failed' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
