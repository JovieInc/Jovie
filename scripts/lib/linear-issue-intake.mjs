const LINEAR_API = 'https://api.linear.app/graphql';
const LINEAR_REQUEST_TIMEOUT_MS = 15_000;
export const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

async function readResponse(response) {
  const text = await response.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function linearGraphql(
  { query, variables, apiKey, fetchImpl = fetch },
  caller
) {
  try {
    const response = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
    });
    const parsed = await readResponse(response);
    if (!response.ok) {
      return {
        ok: false,
        reason: `${caller}_${response.status}`,
        body: parsed.json ?? parsed.text,
      };
    }
    if (Array.isArray(parsed.json?.errors) && parsed.json.errors.length > 0)
      return {
        ok: false,
        reason: `${caller}_graphql_error`,
        body: parsed.json.errors,
      };
    return { ok: true, data: parsed.json?.data ?? null, raw: parsed.json };
  } catch (error) {
    return {
      ok: false,
      reason: `${caller}_transport`,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

// Dedup by fingerprint in the title. Linear removed issueSearch.
// stateName (optional): create new issues directly in that workflow state
// (e.g. 'Todo') so P0 intakes skip the default Triage state, and promote a
// matching non-terminal issue found sitting in that state's predecessor.
export async function upsertLinearIssueByTitleFingerprint({
  fingerprint,
  title,
  description,
  priority = 1,
  stateName = '',
  reopenTerminal = false,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    return { ok: false, reason: 'missing_linear_api_key' };
  }
  if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
    return { ok: false, reason: 'missing_fingerprint' };
  }

  const found = await linearGraphql(
    {
      query: `
        query FindIssueByFingerprint($teamId: String!, $fingerprint: String!) {
          team(id: $teamId) { states { nodes { id name type } } }
          issues(
            filter: {
              team: { id: { eq: $teamId } }
              title: { contains: $fingerprint }
            }
            first: 5
          ) {
            nodes { id identifier url title description state { id name type } }
          }
        }
      `,
      variables: { teamId: JOVIE_TEAM_ID, fingerprint },
      apiKey,
      fetchImpl,
    },
    'linear_search'
  );
  if (!found.ok) return found;

  const match =
    found.data?.issues?.nodes?.find(node =>
      String(node?.title ?? '').includes(fingerprint)
    ) ?? null;

  if (!match) {
    let createInput = { title, description, priority };
    if (stateName) {
      const targetState = (found.data?.team?.states?.nodes ?? []).find(
        state => state?.name === stateName
      );
      if (!targetState) {
        return { ok: false, reason: 'linear_state_missing', body: stateName };
      }
      createInput = { ...createInput, stateId: targetState.id };
    }
    const created = await linearGraphql(
      {
        query: `
          mutation CreateDedupedLinearIssue(
            $title: String!
            $description: String!
            $priority: Int
            $stateId: String
          ) {
            issueCreate(input: {
              teamId: "${JOVIE_TEAM_ID}"
              title: $title
              description: $description
              priority: $priority
              stateId: $stateId
            }) {
              success
              issue { id identifier url }
            }
          }
        `,
        variables: createInput,
        apiKey,
        fetchImpl,
      },
      'linear_create'
    );
    if (!created.ok) return created;
    if (!created.data?.issueCreate?.success) {
      return {
        ok: false,
        reason: 'linear_create_unsuccessful',
        body: created.raw,
      };
    }
    return {
      ok: true,
      action: 'created',
      id: created.data.issueCreate.issue?.id ?? null,
      identifier: created.data.issueCreate.issue?.identifier ?? null,
      url: created.data.issueCreate.issue?.url ?? null,
    };
  }

  const terminal = ['completed', 'canceled'].includes(match.state?.type);
  const states = found.data?.team?.states?.nodes ?? [];
  const backlogState =
    states.find(state => state?.name === 'Backlog') ??
    states.find(state => state?.type === 'backlog');
  if (terminal && reopenTerminal && !backlogState)
    return { ok: false, reason: 'linear_backlog_state_missing' };
  let promoteStateId = null;
  if (stateName && !terminal) {
    const targetState = states.find(state => state?.name === stateName);
    if (!targetState) {
      return { ok: false, reason: 'linear_state_missing', body: stateName };
    }
    if (match.state?.id !== targetState.id) promoteStateId = targetState.id;
  }
  const input = {
    description,
    ...(terminal && reopenTerminal ? { stateId: backlogState.id } : {}),
    ...(promoteStateId ? { stateId: promoteStateId } : {}),
  };
  const updated = await linearGraphql(
    {
      query: `
        mutation UpdateDedupedLinearIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: { id: match.id, input },
      apiKey,
      fetchImpl,
    },
    'linear_update'
  );
  if (!updated.ok) return updated;
  if (!updated.data?.issueUpdate?.success) {
    return {
      ok: false,
      reason: 'linear_update_unsuccessful',
      body: updated.raw,
    };
  }
  return {
    ok: true,
    action: 'updated',
    reopened: terminal && reopenTerminal,
    promoted: Boolean(promoteStateId),
    id: match.id,
    identifier: match.identifier,
    url: match.url,
  };
}
