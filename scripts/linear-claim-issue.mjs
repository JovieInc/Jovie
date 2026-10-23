#!/usr/bin/env node
import { createLinearClient } from '../packages/api-client/index.ts';

const identifier = process.argv[2];
const note = process.argv[3] ?? 'Loop orchestrator dispatch';
const key = process.env.LINEAR_API_KEY;
if (!identifier || !key) process.exit(1);
const m = identifier.match(/^JOV-(\d+)$/i);
if (!m) process.exit(1);
// Shared Linear budget, cooldown and retries (.claude/rules/external-apis.md).
const linear = createLinearClient({ identity: key, authorization: () => key });
const gql = (q, v = {}) => linear.graphql(q, v, { priority: 'default' });
const { issues } = await gql(
  `query($n: Float!) { issues(filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }, first: 1) { nodes { id identifier team { states { nodes { id name } } } } } }`,
  { n: Number.parseInt(m[1], 10) }
);
const issue = issues?.nodes?.[0];
if (!issue) {
  throw new Error(`Linear issue ${identifier.toUpperCase()} not found`);
}
const states = issue.team?.states?.nodes ?? [];
const st = states.find(s => /in progress/i.test(s.name));
if (!st) {
  throw new Error(
    `Linear "In Progress" state not found for ${issue.identifier}`
  );
}
await gql(
  `mutation($id: String!, $sid: String!) { issueUpdate(id: $id, input: { stateId: $sid }) { success } }`,
  { id: issue.id, sid: st.id }
);
await gql(
  `mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }`,
  { id: issue.id, body: `**Loop orchestrator** ${note}` }
);
console.log(`Claimed ${issue.identifier}`);
