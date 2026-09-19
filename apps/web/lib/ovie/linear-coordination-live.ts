import 'server-only';

import { env } from '@/lib/env-server';
import type {
  LinearCoordinationDeps,
  LinearIssueSnapshot,
} from '@/lib/ovie/linear-coordination';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

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
      'User-Agent': 'Jovie-Summer-LinearCoordination/1.0',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Linear API error (${response.status})`);
  }
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
  }
  if (!payload.data) {
    throw new Error('Linear GraphQL returned empty data');
  }
  return payload.data;
}

function asSnapshot(issue: {
  id: string;
  identifier: string;
  title: string;
  url: string;
}): LinearIssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
  };
}

/** Live Linear deps for Summer bounded coordination. Injectable in tests. */
export function createLiveLinearCoordinationDeps(): LinearCoordinationDeps {
  return {
    async createIssue(input) {
      const data = await linearGraphql<{
        issueCreate: {
          success: boolean;
          issue: {
            id: string;
            identifier: string;
            title: string;
            url: string;
          } | null;
        };
      }>(
        `mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        {
          input: {
            title: input.title,
            description: input.description,
            teamId: input.teamId,
          },
        }
      );
      if (!data.issueCreate.success || !data.issueCreate.issue) {
        throw new Error('Linear issueCreate failed');
      }
      return asSnapshot(data.issueCreate.issue);
    },
    async updateIssue(input) {
      const data = await linearGraphql<{
        issueUpdate: {
          success: boolean;
          issue: {
            id: string;
            identifier: string;
            title: string;
            url: string;
          } | null;
        };
      }>(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        {
          id: input.issueId,
          input: {
            title: input.title,
            description: input.description,
          },
        }
      );
      if (!data.issueUpdate.success || !data.issueUpdate.issue) {
        throw new Error('Linear issueUpdate failed');
      }
      return asSnapshot(data.issueUpdate.issue);
    },
    async readIssue(issueId) {
      const data = await linearGraphql<{
        issue: {
          id: string;
          identifier: string;
          title: string;
          url: string;
        } | null;
      }>(
        `query ReadIssue($id: String!) {
          issue(id: $id) { id identifier title url }
        }`,
        { id: issueId }
      );
      return data.issue ? asSnapshot(data.issue) : null;
    },
  };
}
