import 'server-only';

import { logIngestEvent } from '@/lib/audit/ingest';
import { env } from '@/lib/env-server';
import { withIdempotency } from '@/lib/idempotency';
import { logger } from '@/lib/utils/logger';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const ACTIVE_STATES = ['triage', 'unstarted', 'started'];

export type TasteAction = 'approve' | 'reject' | 'comment';

export interface TasteInboxIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly label: 'needs:taste' | 'needs:human';
  readonly priority: number;
  readonly priorityLabel: string;
  readonly createdAt: string;
  readonly description: string | null;
}

export interface TasteInboxPayload {
  readonly available: boolean;
  readonly fetchedAt: string;
  readonly issues: readonly TasteInboxIssue[];
  readonly error?: string;
}

interface LinearResponse<T> {
  readonly data?: T;
  readonly errors?: readonly { readonly message: string }[];
}

async function linearRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('Linear is not configured');
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-HUD/1.0',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Linear request failed: ${response.status}`);
  const payload = (await response.json()) as LinearResponse<T>;
  if (payload.errors?.length)
    throw new Error(payload.errors[0]?.message ?? 'Linear request failed');
  if (!payload.data) throw new Error('Linear returned no data');
  return payload.data;
}

export async function fetchTasteInbox(): Promise<TasteInboxPayload> {
  const fetchedAt = new Date().toISOString();
  if (!env.LINEAR_API_KEY)
    return {
      available: false,
      fetchedAt,
      issues: [],
      error: 'Linear is not configured',
    };
  try {
    const data = await linearRequest<{
      issues: {
        nodes: Array<
          Omit<TasteInboxIssue, 'label'> & {
            labels: { nodes: Array<{ name: string }> };
            state: { type: string };
          }
        >;
      };
    }>(
      `query TasteInbox { issues(filter: { state: { type: { in: ["triage", "unstarted", "started"] } } labels: { name: { in: ["needs:taste", "needs:human"] } } } first: 100 orderBy: priority) { nodes { id identifier title url priority priorityLabel createdAt description labels { nodes { name } } state { type } } } }`,
      {}
    );
    const issues = data.issues.nodes
      .filter(issue => ACTIVE_STATES.includes(issue.state.type))
      .map(({ labels, state: _state, ...issue }) => {
        const label = labels.nodes.find(
          node => node.name === 'needs:taste' || node.name === 'needs:human'
        )?.name as TasteInboxIssue['label'] | undefined;
        return label ? { ...issue, label } : null;
      })
      .filter((issue): issue is TasteInboxIssue => issue !== null);
    return { available: true, fetchedAt, issues };
  } catch (error) {
    logger.error('[hud/taste-inbox] Failed to fetch inbox', error);
    return {
      available: true,
      fetchedAt,
      issues: [],
      error: 'Could not reach the taste inbox',
    };
  }
}

async function addComment(issueId: string, body: string): Promise<void> {
  await linearRequest<{ commentCreate: { success: boolean } }>(
    `mutation AddComment($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }`,
    { issueId, body }
  );
}

async function closeIssue(issueId: string): Promise<void> {
  const states = await linearRequest<{
    issue: { team: { states: { nodes: Array<{ id: string; type: string }> } } };
  }>(
    `query FindDoneState($issueId: String!) { issue(id: $issueId) { team { states { nodes { id type } } } } }`,
    { issueId }
  );
  const completed = states.issue.team.states.nodes.find(
    state => state.type === 'completed'
  );
  if (!completed) throw new Error('No completed state is available');
  await linearRequest<{ issueUpdate: { success: boolean } }>(
    `mutation CompleteIssue($issueId: String!, $stateId: String!) { issueUpdate(id: $issueId, input: { stateId: $stateId }) { success } }`,
    { issueId, stateId: completed.id }
  );
}

export async function applyTasteAction(input: {
  issueId: string;
  action: TasteAction;
  comment?: string;
}): Promise<void> {
  const comment = input.comment?.trim();
  if (input.action === 'comment' && !comment)
    throw new Error('A comment is required');
  const key = `hud:taste:${input.issueId}:${input.action}:${comment ?? ''}`;
  await withIdempotency(key, 60, async () => {
    const prefix =
      input.action === 'approve'
        ? 'Approved from Ovie.'
        : input.action === 'reject'
          ? 'Rejected from Ovie.'
          : 'Comment from Ovie.';
    await addComment(
      input.issueId,
      [prefix, comment].filter(Boolean).join('\n\n')
    );
    if (input.action !== 'comment') await closeIssue(input.issueId);
    await logIngestEvent({
      type: 'HUD_TASTE_ACTION',
      action: input.action,
      result: 'success',
      metadata: { issueId: input.issueId, commentLength: comment?.length ?? 0 },
    });
  });
}
