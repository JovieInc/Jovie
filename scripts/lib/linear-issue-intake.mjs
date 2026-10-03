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

/** Post a comment on a Linear issue. */
export async function addLinearIssueComment({
  issueId,
  body,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  if (!issueId) return { ok: false, reason: 'missing_issue_id' };
  const result = await linearGraphql(
    {
      query: `
        mutation AddLinearIssueComment($id: String!, $body: String!) {
          commentCreate(input: { issueId: $id, body: $body }) {
            success
            comment { id }
          }
        }
      `,
      variables: { id: issueId, body },
      apiKey,
      fetchImpl,
    },
    'linear_comment_create'
  );
  if (!result.ok) return result;
  if (!result.data?.commentCreate?.success) {
    return {
      ok: false,
      reason: 'linear_comment_create_unsuccessful',
      body: result.raw,
    };
  }
  return { ok: true, id: result.data.commentCreate.comment?.id ?? null };
}

/** List comments on a Linear issue (body + createdAt, oldest first). */
export async function listLinearIssueComments({
  issueId,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  if (!issueId) return { ok: false, reason: 'missing_issue_id' };
  const result = await linearGraphql(
    {
      query: `
        query ListLinearIssueComments($id: String!) {
          issue(id: $id) {
            comments(first: 100) {
              nodes { id body createdAt }
            }
          }
        }
      `,
      variables: { id: issueId },
      apiKey,
      fetchImpl,
    },
    'linear_comment_list'
  );
  if (!result.ok) return result;
  const nodes = result.data?.issue?.comments?.nodes ?? [];
  return {
    ok: true,
    comments: nodes.map(node => ({
      id: node?.id ?? null,
      body: String(node?.body ?? ''),
      createdAt: node?.createdAt ?? null,
    })),
  };
}

/** Router intake label. Do not double-prefix fingerprints that already start with it. */
export function remediationKey(fingerprint) {
  const name = String(fingerprint ?? '').trim();
  return name.startsWith('remediation:') ? name : `remediation:${name}`;
}

const ISSUE_FIELDS = `
  id identifier url title description
  state { id name type }
  labels(first: 50) { nodes { id name } }
`;

export function resolveLinearIssueByFingerprint(nodes, fingerprint) {
  const labelName = remediationKey(fingerprint);
  const terminalTypes = ['completed', 'canceled'];
  const matches = (nodes ?? []).filter(node => {
    if (String(node?.title ?? '').includes(fingerprint)) return true;
    const labels = node?.labels?.nodes;
    return (
      Array.isArray(labels) && labels.some(label => label?.name === labelName)
    );
  });
  return (
    matches.find(node => !terminalTypes.includes(node?.state?.type)) ??
    matches[0] ??
    null
  );
}

export async function ensureLinearLabel({ name, nodes, apiKey, fetchImpl }) {
  const existing = (nodes ?? []).find(label => label?.name === name);
  if (existing?.id) return { ok: true, id: existing.id };
  const created = await linearGraphql(
    {
      query: `
        mutation CreateRemediationLabel($name: String!, $teamId: String!) {
          issueLabelCreate(input: { name: $name, teamId: $teamId }) {
            success
            issueLabel { id }
          }
        }
      `,
      variables: { name, teamId: JOVIE_TEAM_ID },
      apiKey,
      fetchImpl,
    },
    'linear_label_create'
  );
  if (!created.ok) return created;
  const id = created.data?.issueLabelCreate?.issueLabel?.id ?? null;
  if (!created.data?.issueLabelCreate?.success || !id) {
    return {
      ok: false,
      reason: 'linear_label_create_unsuccessful',
      body: created.raw,
    };
  }
  return { ok: true, id };
}

// Dedup by fingerprint in the title or the remediation:<fingerprint> label.
export async function upsertLinearIssueByTitleFingerprint({
  fingerprint,
  title,
  description,
  priority = 1,
  // Optional state name (e.g. 'Todo') resolved from the team's workflow so a
  // newly created issue can skip the default intake state (JOV-5966).
  createStateName = null,
  // Optional label ids applied only when a new issue is created.
  createLabelIds = [],
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

  const labelName = remediationKey(fingerprint);
  const found = await linearGraphql(
    {
      query: `
        query FindIssueByFingerprint(
          $teamId: String!
          $teamFilterId: ID!
          $fingerprint: String!
          $labelName: String!
        ) {
          team(id: $teamId) {
            states { nodes { id name type } }
            labels(filter: { name: { eq: $labelName } }) { nodes { id name } }
          }
          issues(
            filter: {
              team: { id: { eq: $teamFilterId } }
              title: { contains: $fingerprint }
            }
            first: 25
          ) {
            nodes { ${ISSUE_FIELDS} }
          }
        }
      `,
      variables: {
        teamId: JOVIE_TEAM_ID,
        teamFilterId: JOVIE_TEAM_ID,
        fingerprint,
        labelName,
      },
      apiKey,
      fetchImpl,
    },
    'linear_search'
  );
  if (!found.ok) return found;

  const labelNodes = found.data?.team?.labels?.nodes;
  // Missing team.labels means the caller mock predates the label contract.
  const manageLabels = Array.isArray(labelNodes);
  let match = resolveLinearIssueByFingerprint(
    found.data?.issues?.nodes,
    fingerprint
  );
  if (!match && manageLabels) {
    const labeled = await linearGraphql(
      {
        query: `
          query FindIssueByRemediationLabel(
            $teamFilterId: ID!
            $labelName: String!
          ) {
            issues(
              filter: {
                team: { id: { eq: $teamFilterId } }
                labels: { some: { name: { eq: $labelName } } }
              }
              first: 25
            ) {
              nodes { ${ISSUE_FIELDS} }
            }
          }
        `,
        variables: { teamFilterId: JOVIE_TEAM_ID, labelName },
        apiKey,
        fetchImpl,
      },
      'linear_label_search'
    );
    if (!labeled.ok) return labeled;
    match = resolveLinearIssueByFingerprint(
      labeled.data?.issues?.nodes,
      fingerprint
    );
  }

  let labelId = null;
  if (manageLabels) {
    const ensured = await ensureLinearLabel({
      name: labelName,
      nodes: labelNodes,
      apiKey,
      fetchImpl,
    });
    if (!ensured.ok) return ensured;
    labelId = ensured.id;
  }

  if (!match) {
    const states = found.data?.team?.states?.nodes ?? [];
    const createStateId = createStateName
      ? (states.find(state => state?.name === createStateName)?.id ?? null)
      : null;
    if (createStateName && !createStateId) {
      return { ok: false, reason: 'linear_create_state_missing' };
    }
    const createIds = labelId
      ? [...new Set([...createLabelIds, labelId])]
      : createLabelIds;
    const created = await linearGraphql(
      {
        query: `
          mutation CreateDedupedLinearIssue(
            $title: String!
            $description: String!
            $priority: Int
            $stateId: String
            $labelIds: [String!]
          ) {
            issueCreate(input: {
              teamId: "${JOVIE_TEAM_ID}"
              title: $title
              description: $description
              priority: $priority
              stateId: $stateId
              labelIds: $labelIds
            }) {
              success
              issue { id identifier url }
            }
          }
        `,
        variables: {
          title,
          description,
          priority,
          ...(createStateId ? { stateId: createStateId } : {}),
          ...(createIds.length > 0 ? { labelIds: createIds } : {}),
        },
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
  const todoState =
    states.find(state => state?.name === 'Todo') ??
    states.find(state => state?.type === 'unstarted');
  if (terminal && reopenTerminal && !backlogState)
    return { ok: false, reason: 'linear_backlog_state_missing' };
  const existingLabelNodes = match.labels?.nodes;
  const input = {
    description,
    ...(terminal && reopenTerminal
      ? {
          stateId:
            createStateName === 'Todo' && todoState
              ? todoState.id
              : backlogState.id,
        }
      : {}),
    ...(labelId && Array.isArray(existingLabelNodes)
      ? {
          labelIds: [
            ...new Set([
              ...existingLabelNodes.map(label => label?.id).filter(Boolean),
              labelId,
            ]),
          ],
        }
      : {}),
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
    id: match.id,
    identifier: match.identifier,
    url: match.url,
  };
}
