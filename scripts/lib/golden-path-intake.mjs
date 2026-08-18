const LINEAR_API = 'https://api.linear.app/graphql';
const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

async function readResponse(response) {
  const text = await response.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/**
 * Create the one canonical Linear record required before golden-path dispatch.
 * Never falls back or retries through another tracker.
 */
export async function createGoldenPathLinearIssue(
  { fingerprint, prompt, apiKey = process.env.LINEAR_API_KEY },
  fetchImpl = fetch
) {
  if (!apiKey) {
    return { ok: false, reason: 'missing_linear_api_key' };
  }
  const response = await fetchImpl(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation CreateGoldenPathLockIssue($title: String!, $description: String!) {
          issueCreate(input: {
            teamId: "${JOVIE_TEAM_ID}"
            title: $title
            description: $description
            priority: 1
          }) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: {
        title: `P0: golden path broken in prod (${fingerprint})`,
        description: `${prompt}\n\nGem missed this after the JOV-5085 lock was on.`,
      },
    }),
  });
  const parsed = await readResponse(response);
  if (!response.ok || !parsed.json?.data?.issueCreate?.success) {
    return {
      ok: false,
      reason: `linear_issue_${response.status}`,
      body: parsed.json ?? parsed.text,
    };
  }
  return {
    ok: true,
    id: parsed.json.data.issueCreate.issue?.id ?? null,
    identifier: parsed.json.data.issueCreate.issue?.identifier ?? null,
    url: parsed.json.data.issueCreate.issue?.url ?? null,
  };
}
