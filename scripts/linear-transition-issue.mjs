#!/usr/bin/env node
const identifier = process.argv[2];
const targetState = process.argv[3] ?? 'Done';
const comment = process.argv[4];
const key = process.env.LINEAR_API_KEY;
if (!identifier || !key) process.exit(1);
const normalizedIdentifier = identifier.toUpperCase();
const normalizedTargetState = targetState.trim().toLowerCase();
const m = normalizedIdentifier.match(/^JOV-(\d+)$/);
if (!m || !normalizedTargetState) process.exit(1);
async function gql(q, v = {}) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query: q, variables: v }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(
      `Linear API request failed (${r.status} ${r.statusText}): ${body}`
    );
  }
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors));
  return d.data;
}
const { issues } = await gql(
  `query($n: Float!) { issues(filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }, first: 1) { nodes { id identifier team { states { nodes { id name } } } } } }`,
  { n: Number.parseInt(m[1], 10) }
);
const issue = issues?.nodes?.[0];
if (!issue) {
  throw new Error(`Linear issue ${normalizedIdentifier} not found`);
}
if (issue.identifier.toUpperCase() !== normalizedIdentifier) {
  throw new Error(
    `Linear issue mismatch: expected ${normalizedIdentifier}, got ${issue.identifier}`
  );
}
const states = issue.team?.states?.nodes ?? [];
const st = states.find(
  s => s.name.trim().toLowerCase() === normalizedTargetState
);
if (!st) {
  throw new Error(
    `Linear state "${targetState}" not found for ${issue.identifier}`
  );
}
await gql(
  `mutation($id: String!, $sid: String!) { issueUpdate(id: $id, input: { stateId: $sid }) { success } }`,
  { id: issue.id, sid: st.id }
);
if (comment)
  await gql(
    `mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }`,
    { id: issue.id, body: comment }
  );
console.log(`${issue.identifier} → ${st.name}`);
