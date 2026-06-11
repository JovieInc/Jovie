#!/usr/bin/env node
const identifier = process.argv[2];
const note = process.argv[3] ?? 'Loop orchestrator dispatch';
const key = process.env.LINEAR_API_KEY;
if (!identifier || !key) process.exit(1);
const m = identifier.match(/^JOV-(\d+)$/i);
if (!m) process.exit(1);
async function gql(q, v = {}) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors));
  return d.data;
}
const { issues } = await gql(
  `query($n: Float!) { issues(filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }, first: 1) { nodes { id identifier team { states { nodes { id name } } } } } }`,
  { n: Number.parseInt(m[1], 10) }
);
const issue = issues.nodes[0];
const st = issue.team.states.nodes.find(s => /in progress/i.test(s.name));
await gql(
  `mutation($id: String!, $sid: String!) { issueUpdate(id: $id, input: { stateId: $sid }) { success } }`,
  { id: issue.id, sid: st.id }
);
await gql(
  `mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }`,
  { id: issue.id, body: `**Loop orchestrator** ${note}` }
);
console.log(`Claimed ${issue.identifier}`);
