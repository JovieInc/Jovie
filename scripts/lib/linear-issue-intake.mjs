const LINEAR_API = 'https://api.linear.app/graphql';
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
  const response = await fetchImpl(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const parsed = await readResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      reason: `${caller}_${response.status}`,
      body: parsed.json ?? parsed.text,
    };
  }
  return { ok: true, data: parsed.json?.data ?? null, raw: parsed.json };
}

// Dedup by fingerprint in the title. Linear removed issueSearch.
export async function upsertLinearIssueByTitleFingerprint({
  fingerprint,
  title,
  description,
  priority = 1,
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
          issues(
            filter: {
              team: { id: { eq: $teamId } }
              title: { contains: $fingerprint }
            }
            first: 5
          ) {
            nodes { id identifier url title description }
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
    const created = await linearGraphql(
      {
        query: `
          mutation CreateDedupedLinearIssue(
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
              issue { id identifier url }
            }
          }
        `,
        variables: { title, description, priority },
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

  const updated = await linearGraphql(
    {
      query: `
        mutation UpdateDedupedLinearIssue($id: String!, $description: String!) {
          issueUpdate(id: $id, input: { description: $description }) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: { id: match.id, description },
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
    id: match.id,
    identifier: match.identifier,
    url: match.url,
  };
}
