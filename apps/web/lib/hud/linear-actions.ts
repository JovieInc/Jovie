import 'server-only';

import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

// Label ID for tim-action-required (created 2026-05-08)
const TIM_ACTION_REQUIRED_LABEL_ID = '518b8d3f-30b4-46ad-85e7-b5cd2546a85f';

export interface TimActionIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  priorityLabel: string;
  createdAt: string; // ISO
  /** Days since created (rounded down) */
  daysOld: number;
  stateType: string;
}

export interface TimActionsResponse {
  issues: TimActionIssue[];
  fetchedAt: string; // ISO
  available: boolean;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  createdAt: string;
  state: {
    type: string;
  };
}

interface LinearGraphQLResponse {
  data?: {
    issues?: {
      nodes: LinearIssueNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

const ACTIVE_STATE_TYPES = ['triage', 'unstarted', 'started'];

function computeDaysOld(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
}

/**
 * Fetches all Linear issues labeled `tim-action-required` that are in an
 * active state (triage, unstarted, started). Sorted by priority desc then
 * createdAt desc (oldest last since priority is most important).
 *
 * Returns an empty list if LINEAR_API_KEY is not configured.
 */
export async function fetchTimActionIssues(): Promise<TimActionsResponse> {
  const apiKey = env.LINEAR_API_KEY;
  const fetchedAt = new Date().toISOString();

  if (!apiKey) {
    logger.warn('[hud/linear-actions] LINEAR_API_KEY not configured');
    return { issues: [], fetchedAt, available: false };
  }

  const query = `
    query TimActionIssues($labelId: ID!) {
      issues(
        filter: {
          labels: { id: { eq: $labelId } }
          state: { type: { in: ["triage", "unstarted", "started"] } }
        }
        first: 50
        orderBy: createdAt
      ) {
        nodes {
          id
          identifier
          title
          url
          priority
          priorityLabel
          createdAt
          state {
            type
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-HUD/1.0',
      },
      body: JSON.stringify({
        query,
        variables: { labelId: TIM_ACTION_REQUIRED_LABEL_ID },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error(
        '[hud/linear-actions] Linear API error',
        response.status,
        response.statusText
      );
      return { issues: [], fetchedAt, available: false };
    }

    const payload = (await response.json()) as LinearGraphQLResponse;

    if (payload.errors && payload.errors.length > 0) {
      logger.error(
        '[hud/linear-actions] Linear GraphQL errors',
        payload.errors[0]?.message
      );
      return { issues: [], fetchedAt, available: false };
    }

    const nodes = payload.data?.issues?.nodes ?? [];

    // Filter to active states defensively (Linear filter may not be perfect)
    const active = nodes.filter(n => ACTIVE_STATE_TYPES.includes(n.state.type));

    // Sort: priority ASC (1=urgent is best) then createdAt ASC (oldest first = most urgent)
    // In the UI this renders as: most-urgent priority at top, oldest within same priority at top
    active.sort((a, b) => {
      const aPriority = a.priority === 0 ? 5 : a.priority; // treat "no priority" as lowest
      const bPriority = b.priority === 0 ? 5 : b.priority;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Within same priority, older issues first (more urgent to close)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const issues: TimActionIssue[] = active.map(node => ({
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      url: node.url,
      priority: node.priority,
      priorityLabel: node.priorityLabel,
      createdAt: node.createdAt,
      daysOld: computeDaysOld(node.createdAt),
      stateType: node.state.type,
    }));

    return { issues, fetchedAt, available: true };
  } catch (error) {
    logger.error(
      '[hud/linear-actions] Failed to fetch tim-action issues',
      error
    );
    return { issues: [], fetchedAt, available: false };
  }
}

/**
 * Closes a Linear issue by transitioning it to "Done" state via the Linear
 * GraphQL API. Returns true on success, false on failure.
 */
export async function closeLinearIssue(issueId: string): Promise<boolean> {
  const apiKey = env.LINEAR_API_KEY;

  if (!apiKey) {
    logger.warn(
      '[hud/linear-actions] LINEAR_API_KEY not configured; cannot close issue'
    );
    return false;
  }

  // Step 1: find a "completed" state to transition to.
  // We use the issue's team to find the right completed state.
  const findStateQuery = `
    query FindCompletedState($issueId: String!) {
      issue(id: $issueId) {
        team {
          states {
            nodes {
              id
              type
              name
            }
          }
        }
      }
    }
  `;

  interface FindStateResponse {
    data?: {
      issue?: {
        team?: {
          states?: {
            nodes: Array<{ id: string; type: string; name: string }>;
          };
        };
      };
    };
    errors?: Array<{ message: string }>;
  }

  try {
    const stateRes = await fetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-HUD/1.0',
      },
      body: JSON.stringify({ query: findStateQuery, variables: { issueId } }),
      signal: AbortSignal.timeout(10000),
    });

    if (!stateRes.ok) {
      logger.error(
        '[hud/linear-actions] Failed to find completed state',
        stateRes.status
      );
      return false;
    }

    const statePayload = (await stateRes.json()) as FindStateResponse;
    const states = statePayload.data?.issue?.team?.states?.nodes ?? [];
    const completedState = states.find(s => s.type === 'completed');

    if (!completedState) {
      logger.error(
        '[hud/linear-actions] No completed state found for issue',
        issueId
      );
      return false;
    }

    // Step 2: update the issue to the completed state
    const updateMutation = `
      mutation CloseIssue($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
        }
      }
    `;

    interface UpdateResponse {
      data?: { issueUpdate?: { success: boolean } };
      errors?: Array<{ message: string }>;
    }

    const updateRes = await fetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-HUD/1.0',
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: { issueId, stateId: completedState.id },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!updateRes.ok) {
      logger.error(
        '[hud/linear-actions] Failed to update issue',
        updateRes.status
      );
      return false;
    }

    const updatePayload = (await updateRes.json()) as UpdateResponse;

    if (updatePayload.errors && updatePayload.errors.length > 0) {
      logger.error(
        '[hud/linear-actions] GraphQL error closing issue',
        updatePayload.errors[0]?.message
      );
      return false;
    }

    const success = updatePayload.data?.issueUpdate?.success ?? false;
    if (!success) {
      logger.error(
        '[hud/linear-actions] issueUpdate returned success=false for',
        issueId
      );
    }
    return success;
  } catch (error) {
    logger.error(
      `[hud/linear-actions] Failed to close issue ${issueId}`,
      error
    );
    return false;
  }
}
