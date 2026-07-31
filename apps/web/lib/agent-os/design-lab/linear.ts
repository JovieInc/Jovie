import 'server-only';

import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export type DesignLabLinearTargetState = 'completed' | 'canceled';

interface LinearIssueLookup {
  readonly id: string;
  readonly identifier: string;
}

interface LinearTeamState {
  readonly id: string;
  readonly type: string;
  readonly name: string;
}

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY is not configured');
  }

  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-DesignLab/1.0',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Linear API error (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
  }

  if (!payload.data) {
    throw new Error('Linear GraphQL returned empty data');
  }

  return payload.data;
}

async function lookupLinearIssue(
  issueIdentifier: string
): Promise<LinearIssueLookup | null> {
  const query = `
    query LookupIssue($identifier: String!) {
      issue(id: $identifier) {
        id
        identifier
      }
    }
  `;

  try {
    const data = await linearGraphql<{
      issue: LinearIssueLookup | null;
    }>(query, { identifier: issueIdentifier });

    return data.issue;
  } catch (error) {
    logger.warn('[design-lab/linear] Failed direct issue lookup', {
      issueIdentifier,
      error,
    });
    return null;
  }
}

async function lookupLinearIssueBySearch(
  issueIdentifier: string
): Promise<LinearIssueLookup | null> {
  const query = `
    query SearchIssue($query: String!) {
      issues(filter: { title: { containsIgnoreCase: $query } }, first: 1) {
        nodes {
          id
          identifier
        }
      }
    }
  `;

  const data = await linearGraphql<{
    issues: { nodes: LinearIssueLookup[] };
  }>(query, { query: issueIdentifier });

  return (
    data.issues.nodes.find(node => node.identifier === issueIdentifier) ?? null
  );
}

async function resolveLinearIssue(
  issueIdentifier: string
): Promise<LinearIssueLookup | null> {
  const direct = await lookupLinearIssue(issueIdentifier);
  if (direct) {
    return direct;
  }

  return lookupLinearIssueBySearch(issueIdentifier);
}

async function findTeamState(
  issueId: string,
  target: DesignLabLinearTargetState
): Promise<LinearTeamState | null> {
  const query = `
    query IssueTeamStates($issueId: String!) {
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

  const data = await linearGraphql<{
    issue: {
      team: {
        states: {
          nodes: LinearTeamState[];
        };
      };
    } | null;
  }>(query, { issueId });

  const states = data.issue?.team.states.nodes ?? [];
  return states.find(state => state.type === target) ?? null;
}

export async function updateDesignLabLinearIssueStatus(
  issueIdentifier: string,
  target: DesignLabLinearTargetState
): Promise<boolean> {
  if (!env.LINEAR_API_KEY) {
    logger.warn('[design-lab/linear] LINEAR_API_KEY not configured');
    return false;
  }

  try {
    const issue = await resolveLinearIssue(issueIdentifier);
    if (!issue) {
      logger.warn('[design-lab/linear] Issue not found', { issueIdentifier });
      return false;
    }

    const state = await findTeamState(issue.id, target);
    if (!state) {
      logger.warn('[design-lab/linear] Target state not found', {
        issueIdentifier,
        target,
      });
      return false;
    }

    const mutation = `
      mutation UpdateIssueState($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
        }
      }
    `;

    const result = await linearGraphql<{
      issueUpdate: { success: boolean };
    }>(mutation, { issueId: issue.id, stateId: state.id });

    return result.issueUpdate.success;
  } catch (error) {
    logger.error('[design-lab/linear] Failed to update issue status', {
      issueIdentifier,
      target,
      error,
    });
    return false;
  }
}

export interface DesignLabLinearArtifactLink {
  readonly issueIdentifier: string;
  readonly dispatchId: string;
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly proposalId: string;
  readonly proposalText: string;
  readonly amendmentNotes: string | null;
  readonly artifactRelativePath: string;
  readonly dispatchRelativePath: string;
  /**
   * Optional HTTPS URL for Linear attachment unfurl (e.g. GitHub blob/tree URL
   * once the artifact is committed, or an operator UI deep link). When omitted,
   * only a durable comment is written.
   */
  readonly artifactUrl: string | null;
}

function buildDispatchLinkCommentBody(
  params: DesignLabLinearArtifactLink
): string {
  const notesLine = params.amendmentNotes?.trim()
    ? `- Amendment notes: ${params.amendmentNotes.trim()}`
    : null;
  const proposalPreview = params.proposalText.trim().slice(0, 500);
  const proposalEllipsis = params.proposalText.trim().length > 500 ? '…' : '';

  return [
    '## Design HTML builder dispatched',
    '',
    'Approved Design Lab proposal routed to `/design-html`.',
    '',
    `- Surface: **${params.surfaceName}** (\`${params.surfaceId}\`)`,
    `- Proposal: \`${params.proposalId}\``,
    `- Dispatch: \`${params.dispatchId}\``,
    `- Dispatch manifest: \`${params.dispatchRelativePath}\``,
    `- Artifact directory: \`${params.artifactRelativePath}\``,
    notesLine,
    '',
    '### Approved proposal',
    '',
    proposalPreview + proposalEllipsis,
    '',
    'The HTML artifact will be written under the artifact directory. When complete, attach the resulting HTML file path back to this issue.',
  ]
    .filter((part): part is string => part !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Links a design-html builder dispatch (and optional public artifact URL) back
 * to the originating Linear issue. Always best-effort: returns false on any
 * failure so dispatch success is not blocked by Linear availability.
 */
export async function linkDesignLabDispatchToLinearIssue(
  params: DesignLabLinearArtifactLink
): Promise<boolean> {
  if (!env.LINEAR_API_KEY) {
    logger.warn('[design-lab/linear] LINEAR_API_KEY not configured');
    return false;
  }

  try {
    const issue = await resolveLinearIssue(params.issueIdentifier);
    if (!issue) {
      logger.warn('[design-lab/linear] Issue not found for artifact link', {
        issueIdentifier: params.issueIdentifier,
        dispatchId: params.dispatchId,
      });
      return false;
    }

    const commentMutation = `
      mutation CreateDesignLabComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }
    `;

    const commentResult = await linearGraphql<{
      commentCreate: { success: boolean };
    }>(commentMutation, {
      issueId: issue.id,
      body: buildDispatchLinkCommentBody(params),
    });

    if (!commentResult.commentCreate.success) {
      logger.warn('[design-lab/linear] Comment create returned success=false', {
        issueIdentifier: params.issueIdentifier,
        dispatchId: params.dispatchId,
      });
      return false;
    }

    const artifactUrl = params.artifactUrl?.trim() ?? '';
    if (artifactUrl.length === 0) {
      return true;
    }

    const attachmentMutation = `
      mutation LinkDesignLabArtifact(
        $issueId: String!
        $url: String!
        $title: String!
        $subtitle: String
      ) {
        attachmentLinkURL(
          issueId: $issueId
          url: $url
          title: $title
          subtitle: $subtitle
        ) {
          success
        }
      }
    `;

    const attachmentResult = await linearGraphql<{
      attachmentLinkURL: { success: boolean };
    }>(attachmentMutation, {
      issueId: issue.id,
      url: artifactUrl,
      title: `Design HTML: ${params.surfaceName}`,
      subtitle: `dispatch ${params.dispatchId}`,
    });

    if (!attachmentResult.attachmentLinkURL.success) {
      logger.warn(
        '[design-lab/linear] attachmentLinkURL returned success=false',
        {
          issueIdentifier: params.issueIdentifier,
          dispatchId: params.dispatchId,
        }
      );
      // Comment already persisted; treat partial success as true for operators.
      return true;
    }

    return true;
  } catch (error) {
    logger.error('[design-lab/linear] Failed to link design-html dispatch', {
      issueIdentifier: params.issueIdentifier,
      dispatchId: params.dispatchId,
      error,
    });
    return false;
  }
}
