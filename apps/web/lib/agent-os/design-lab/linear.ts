import 'server-only';

import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import type { DesignProposal } from './types';

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

export interface DesignLabLinearIssueReference {
  readonly identifier: string;
  readonly url: string;
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

export async function createDesignLabLinearIssue(
  proposal: DesignProposal
): Promise<DesignLabLinearIssueReference> {
  const teamData = await linearGraphql<{
    teams: { nodes: Array<{ id: string }> };
  }>(
    `query DesignLabTeam($key: String!) {
      teams(filter: { key: { eq: $key } }, first: 1) { nodes { id } }
    }`,
    { key: 'JOV' }
  );
  const teamId = teamData.teams.nodes[0]?.id;
  if (!teamId) throw new Error('Linear team JOV was not found.');

  const task = proposal.designGap?.registryTask;
  if (!task)
    throw new Error('Registry task is required before Linear issue creation.');
  const description = [
    proposal.proposalText,
    '',
    'Required changes:',
    ...task.requiredChanges.map(item => `- ${item}`),
    '',
    'Exact files:',
    ...task.exactFiles.map(item => `- ${item}`),
    '',
    'Validation:',
    ...task.validationCommands.map(item => `- \`${item}\``),
  ].join('\n');
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean;
      issue: { identifier: string; url: string };
    };
  }>(
    `mutation CreateDesignLabIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { identifier url }
      }
    }`,
    {
      input: {
        teamId,
        title: `[Design Lab] ${proposal.surfaceName}`,
        description,
      },
    }
  );
  if (!data.issueCreate.success) {
    throw new Error('Linear issue creation returned success=false.');
  }
  return data.issueCreate.issue;
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
