import { boundedFetch } from '../bounded-fetch';
import type { TasteInboxLabel } from '../linear';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

interface LinearGraphQLResponse<T> {
  readonly data?: T;
  readonly errors?: ReadonlyArray<{ message: string }>;
}

async function linearGql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await boundedFetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-Console/1.0',
    },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 10_000,
    context: 'linear.taste-slack',
  });

  if (!response.ok) {
    throw new Error(`Linear API responded ${response.status}`);
  }

  const payload = (await response.json()) as LinearGraphQLResponse<T>;
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
  }
  if (!payload.data) {
    throw new Error('Linear GraphQL returned empty data');
  }
  return payload.data;
}

async function findTeamLabelId(
  apiKey: string,
  issueId: string,
  labelName: TasteInboxLabel
): Promise<string | null> {
  const data = await linearGql<{
    issue: {
      team: { labels: { nodes: ReadonlyArray<{ id: string; name: string }> } };
    };
  }>(
    apiKey,
    `query IssueTeamLabels($id: String!) {
      issue(id: $id) {
        team { labels { nodes { id name } } }
      }
    }`,
    { id: issueId }
  );

  return (
    data.issue.team.labels.nodes.find(label => label.name === labelName)?.id ??
    null
  );
}

async function findInProgressStateId(
  apiKey: string,
  issueId: string
): Promise<string | null> {
  const data = await linearGql<{
    issue: {
      team: {
        states: {
          nodes: ReadonlyArray<{ id: string; name: string; type: string }>;
        };
      };
    };
  }>(
    apiKey,
    `query IssueTeamStates($id: String!) {
      issue(id: $id) {
        team { states { nodes { id name type } } }
      }
    }`,
    { id: issueId }
  );

  const states = data.issue.team.states.nodes;
  const inProgress = states.find(
    state => state.type === 'started' || state.name === 'In Progress'
  );
  return inProgress?.id ?? null;
}

export async function addLinearIssueComment(params: {
  readonly apiKey: string;
  readonly issueId: string;
  readonly body: string;
}): Promise<void> {
  const data = await linearGql<{ commentCreate: { success: boolean } }>(
    params.apiKey,
    `mutation CommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) { success }
    }`,
    {
      input: {
        issueId: params.issueId,
        body: params.body,
      },
    }
  );

  if (!data.commentCreate.success) {
    throw new Error('commentCreate returned success=false');
  }
}

export async function approveTasteInboxIssue(params: {
  readonly apiKey: string;
  readonly issueId: string;
  readonly identifier: string;
  readonly label: TasteInboxLabel;
  readonly reviewerSlackUserId: string;
}): Promise<void> {
  const labelId = await findTeamLabelId(
    params.apiKey,
    params.issueId,
    params.label
  );
  const stateId = await findInProgressStateId(params.apiKey, params.issueId);

  if (stateId) {
    const data = await linearGql<{ issueUpdate: { success: boolean } }>(
      params.apiKey,
      `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }`,
      {
        id: params.issueId,
        input: { stateId },
      }
    );

    if (!data.issueUpdate.success) {
      throw new Error('issueUpdate returned success=false');
    }
  }

  if (labelId) {
    const removeLabelData = await linearGql<{
      issueLabelDelete: { success: boolean };
    }>(
      params.apiKey,
      `mutation IssueLabelDelete($issueId: String!, $labelId: String!) {
        issueLabelDelete(issueId: $issueId, labelId: $labelId) { success }
      }`,
      { issueId: params.issueId, labelId }
    );
    if (!removeLabelData.issueLabelDelete.success) {
      throw new Error('issueLabelDelete returned success=false');
    }
  }

  await addLinearIssueComment({
    apiKey: params.apiKey,
    issueId: params.issueId,
    body: [
      '**Taste inbox:** approved by Aria (:+1:).',
      '',
      `- Cleared label: \`${params.label}\``,
      `- Reviewer (Slack): ${params.reviewerSlackUserId}`,
      `- Issue: ${params.identifier}`,
    ].join('\n'),
  });
}

export async function rejectTasteInboxIssue(params: {
  readonly apiKey: string;
  readonly issueId: string;
  readonly identifier: string;
  readonly label: TasteInboxLabel;
  readonly reviewerSlackUserId: string;
}): Promise<void> {
  await addLinearIssueComment({
    apiKey: params.apiKey,
    issueId: params.issueId,
    body: [
      '**Taste inbox:** routed back by Aria (:-1:).',
      '',
      'Please reply in Linear with what to change, then re-label when ready.',
      '',
      `- Label kept: \`${params.label}\``,
      `- Reviewer (Slack): ${params.reviewerSlackUserId}`,
      `- Issue: ${params.identifier}`,
    ].join('\n'),
  });
}
