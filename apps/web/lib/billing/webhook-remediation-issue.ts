import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/** JOV-7540 recurrence key. One Linear issue, updated in place. */
export const BILLING_WEBHOOK_REMEDIATION_FINGERPRINT =
  'remediation:billing-webhooks';

const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
const LINEAR_API = 'https://api.linear.app/graphql';

export interface BillingWebhookRemediationReport {
  examined: number;
  processed: number;
  failed: number;
  subscriptionStateEventIds: readonly string[];
  detail?: string;
}

/**
 * Upsert the billing-webhook recurrence issue. Missing credentials log and
 * return; the cron must keep running.
 */
export async function fileBillingWebhookRemediationIssue(
  report: BillingWebhookRemediationReport
): Promise<void> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    logger.warn(
      '[billing-webhooks] LINEAR_API_KEY missing; skipped remediation:billing-webhooks'
    );
    return;
  }

  const title = `${BILLING_WEBHOOK_REMEDIATION_FINGERPRINT} Stripe webhook backlog`;
  const description = renderDescription(report);

  try {
    const found = (await linearGraphql(apiKey, FIND_ISSUE, {
      teamId: JOVIE_TEAM_ID,
      teamFilterId: JOVIE_TEAM_ID,
      fingerprint: BILLING_WEBHOOK_REMEDIATION_FINGERPRINT,
    })) as LinearFindResult | null;
    const nodes = found?.issues?.nodes ?? [];
    const matches = nodes.filter(node =>
      String(node?.title ?? '').includes(
        BILLING_WEBHOOK_REMEDIATION_FINGERPRINT
      )
    );
    const terminalTypes = new Set(['completed', 'canceled']);
    const match =
      matches.find(node => !terminalTypes.has(node?.state?.type ?? '')) ??
      matches[0] ??
      null;

    if (!match) {
      await linearGraphql(apiKey, CREATE_ISSUE, {
        title,
        description,
        priority: 2,
      });
      return;
    }

    const terminal = terminalTypes.has(match.state?.type ?? '');
    const states = found?.team?.states?.nodes ?? [];
    const todoState =
      states.find(state => state?.name === 'Todo') ??
      states.find(state => state?.type === 'unstarted');
    await linearGraphql(apiKey, UPDATE_ISSUE, {
      id: match.id,
      input: {
        description,
        ...(terminal && todoState ? { stateId: todoState.id } : {}),
      },
    });
  } catch (error) {
    logger.warn('[billing-webhooks] remediation issue upsert failed', {
      error,
    });
  }
}

function renderDescription(report: BillingWebhookRemediationReport): string {
  const stateIds =
    report.subscriptionStateEventIds.length > 0
      ? report.subscriptionStateEventIds.join(', ')
      : 'none';
  return [
    `Fingerprint: ${BILLING_WEBHOOK_REMEDIATION_FINGERPRINT}`,
    'Contract: JOV-7540. One issue for this class; update in place when the backlog returns.',
    '',
    `Replay examined ${report.examined}, processed ${report.processed}, failed ${report.failed}.`,
    `Stored events that can change subscription state: ${stateIds}.`,
    report.detail ? `Detail: ${report.detail}` : '',
    '',
    'Replay reads rows already stored after signature verification and sends them through the existing handler. It does not create charges or refunds. A subscription refund or dispute still follows the normal charge handler, which can cancel that subscription.',
    '',
    'Delivery check on 2026-09-29: signature verification rejected evt_1UL3c0ASl9B9udHvpzfeAM51 twice (two signature schemes against the configured live secret). That event was not stored. Silence after that rejection matched one active subscription and no further webhook runtime errors, not a missing route.',
  ]
    .filter(line => line !== '')
    .join('\n');
}

interface LinearFindResult {
  team?: { states?: { nodes?: LinearStateNode[] } };
  issues?: { nodes?: LinearIssueNode[] };
}

interface LinearIssueNode {
  id: string;
  title?: string;
  state?: { type?: string };
}

interface LinearStateNode {
  id: string;
  name?: string;
  type?: string;
}

const FIND_ISSUE = `
  query FindBillingWebhookRemediation(
    $teamId: String!
    $teamFilterId: ID!
    $fingerprint: String!
  ) {
    team(id: $teamId) { states { nodes { id name type } } }
    issues(
      filter: {
        team: { id: { eq: $teamFilterId } }
        title: { contains: $fingerprint }
      }
      first: 10
    ) {
      nodes { id title state { type } }
    }
  }
`;

const CREATE_ISSUE = `
  mutation CreateBillingWebhookRemediation(
    $title: String!
    $description: String!
    $priority: Int
  ) {
    issueCreate(input: {
      teamId: "${JOVIE_TEAM_ID}"
      title: $title
      description: $description
      priority: $priority
    }) {
      success
    }
  }
`;

const UPDATE_ISSUE = `
  mutation UpdateBillingWebhookRemediation($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { success }
  }
`;

async function linearGraphql(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`linear_${response.status}`);
  }
  const body = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: unknown[];
  };
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error('linear_graphql_error');
  }
  return body.data ?? null;
}
