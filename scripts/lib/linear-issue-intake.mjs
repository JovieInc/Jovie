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

const REMEDIATION_KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const labelCache = new Map();

/** Router intake label. Do not double-prefix fingerprints that already start with it. */
export function remediationKey(fingerprint) {
  const name = String(fingerprint ?? '').trim();
  return name.startsWith('remediation:') ? name : `remediation:${name}`;
}

export function bareRemediationKey(value) {
  const name = String(value ?? '').trim();
  return name.startsWith('remediation:')
    ? name.slice('remediation:'.length)
    : name;
}

export function isValidRemediationKey(value) {
  return REMEDIATION_KEY_RE.test(bareRemediationKey(value));
}

/**
 * File by default. Skip only when REMEDIATION_TRIGGERS_DISABLED is exactly
 * "true". An unset variable still files. The old REMEDIATION_TRIGGERS_ENABLED
 * opt-in is ignored so a missing repo variable cannot silence red intake.
 */
export function remediationTriggersEnabled(env = process.env) {
  return env.REMEDIATION_TRIGGERS_DISABLED !== 'true';
}

export function logRemediationDryRun(plan) {
  const action = plan.action ?? 'upsert';
  const key = plan.key ?? '';
  const fingerprint = plan.fingerprint ?? '';
  console.log(
    `remediation dry-run ${action} key=${key} fingerprint=${fingerprint}`
  );
  console.log(JSON.stringify({ remediation: 'dry-run', ...plan }));
  return { ok: true, action: 'dry-run', ...plan };
}

export function clearRemediationLabelCache() {
  labelCache.clear();
}

const ISSUE_FIELDS = `
  id identifier url title description
  state { id name type }
  labels(first: 50) { nodes { id name } }
`;

export function resolveLinearIssueByFingerprint(
  nodes,
  fingerprint,
  labelFingerprint = fingerprint
) {
  const labelName = remediationKey(labelFingerprint);
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

export async function ensureLinearLabel({
  name,
  nodes,
  apiKey,
  fetchImpl,
  color = '#E5484D',
  teamId = JOVIE_TEAM_ID,
}) {
  const cacheKey = `${teamId}:${name}`;
  if (labelCache.has(cacheKey)) {
    return { ok: true, id: labelCache.get(cacheKey) };
  }
  const existing = (nodes ?? []).find(label => label?.name === name);
  if (existing?.id) {
    labelCache.set(cacheKey, existing.id);
    return { ok: true, id: existing.id };
  }
  const created = await linearGraphql(
    {
      query: `
        mutation CreateRemediationLabel($name: String!, $teamId: String!, $color: String!) {
          issueLabelCreate(input: { name: $name, teamId: $teamId, color: $color }) {
            success
            issueLabel { id }
          }
        }
      `,
      variables: { name, teamId, color },
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
  labelCache.set(cacheKey, id);
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
  // undefined distinguishes "omitted" from an explicit false. A stable
  // labelKey reopens unless the caller opts out.
  reopenTerminal = undefined,
  labelKey = null,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    return { ok: false, reason: 'missing_linear_api_key' };
  }
  if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
    return { ok: false, reason: 'missing_fingerprint' };
  }

  const stableLabel = labelKey != null && String(labelKey).trim().length > 0;
  if (stableLabel && !isValidRemediationKey(labelKey)) {
    return { ok: false, reason: 'invalid_remediation_key' };
  }
  const labelSource = stableLabel ? bareRemediationKey(labelKey) : fingerprint;
  const labelName = remediationKey(labelSource);
  const shouldReopen = stableLabel
    ? reopenTerminal !== false
    : reopenTerminal === true;
  const footer = `Fingerprint: remediation:${bareRemediationKey(labelSource)}`;
  const descriptionBody =
    stableLabel && !String(description ?? '').includes(footer)
      ? `${description}\n\n${footer}`
      : description;
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
    fingerprint,
    labelSource
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
      fingerprint,
      labelSource
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
          description: descriptionBody,
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
  if (terminal && shouldReopen && !backlogState)
    return { ok: false, reason: 'linear_backlog_state_missing' };
  const existingLabelNodes = match.labels?.nodes;
  const input = {
    description: descriptionBody,
    ...(terminal && shouldReopen
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
    reopened: terminal && shouldReopen,
    id: match.id,
    identifier: match.identifier,
    url: match.url,
  };
}

const TERMINAL_STATE_TYPES = ['completed', 'canceled'];

/**
 * Green-run closer. `resolveLinearIssueByFingerprint` only picks a node;
 * this posts one `recovered-run:<runId>` comment and moves the open issue
 * to Done. A second call in the same run is a no-op.
 */
export async function closeLinearIssueByFingerprint({
  fingerprint,
  comment = 'Condition cleared.',
  runId,
  labelKey = null,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
    return { ok: false, reason: 'missing_fingerprint' };
  }
  const stableLabel = labelKey != null && String(labelKey).trim().length > 0;
  if (stableLabel && !isValidRemediationKey(labelKey)) {
    return { ok: false, reason: 'invalid_remediation_key' };
  }
  const labelSource = stableLabel ? bareRemediationKey(labelKey) : fingerprint;
  const labelName = remediationKey(labelSource);
  const found = await linearGraphql(
    {
      query: `
        query FindIssueToClose(
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
    'linear_close_search'
  );
  if (!found.ok) return found;

  const labelNodes = found.data?.team?.labels?.nodes;
  const manageLabels = Array.isArray(labelNodes);
  let nodes = found.data?.issues?.nodes ?? [];
  if (
    manageLabels &&
    !resolveLinearIssueByFingerprint(nodes, fingerprint, labelSource)
  ) {
    const labeled = await linearGraphql(
      {
        query: `
          query FindOpenIssueByRemediationLabel(
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
      'linear_close_label_search'
    );
    if (!labeled.ok) return labeled;
    nodes = labeled.data?.issues?.nodes ?? [];
  }

  const match = resolveLinearIssueByFingerprint(
    nodes,
    fingerprint,
    labelSource
  );
  if (!match || TERMINAL_STATE_TYPES.includes(match.state?.type)) {
    return { ok: true, action: 'noop', reason: 'none_open' };
  }

  const marker = `recovered-run:${runId ?? 'unknown'}`;
  const listed = await listLinearIssueComments({
    issueId: match.id,
    apiKey,
    fetchImpl,
  });
  if (!listed.ok) return listed;
  const already = listed.comments.some(entry => entry.body.includes(marker));
  if (!already) {
    const posted = await addLinearIssueComment({
      issueId: match.id,
      body: `${comment}\n\n<!-- ${marker} -->`,
      apiKey,
      fetchImpl,
    });
    if (!posted.ok) return posted;
  }

  const states = found.data?.team?.states?.nodes ?? [];
  const done =
    states.find(state => state?.name === 'Done') ??
    states.find(state => state?.type === 'completed');
  if (!done?.id) return { ok: false, reason: 'linear_done_state_missing' };

  const updated = await linearGraphql(
    {
      query: `
        mutation CloseRemediationIssue($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: { id: match.id, stateId: done.id },
      apiKey,
      fetchImpl,
    },
    'linear_close'
  );
  if (!updated.ok) return updated;
  if (!updated.data?.issueUpdate?.success) {
    return {
      ok: false,
      reason: 'linear_close_unsuccessful',
      body: updated.raw,
    };
  }
  return {
    ok: true,
    action: 'resolved',
    id: match.id,
    identifier: match.identifier ?? updated.data.issueUpdate.issue?.identifier,
    url: match.url ?? updated.data.issueUpdate.issue?.url,
    commented: !already,
  };
}
