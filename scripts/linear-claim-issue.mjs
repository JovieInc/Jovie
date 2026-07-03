#!/usr/bin/env node
/**
 * @deprecated Use scripts/github-claim-issue.mjs for GitHub Issues.
 * Retained for legacy Linear JOV-NNNN callers during cutover.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const identifier = process.argv[2];
const note = process.argv[3] ?? 'Loop orchestrator dispatch';

const ghMatch = identifier?.match(/^#?(\d+)$/);
if (ghMatch) {
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    'github-claim-issue.mjs'
  );
  const result = spawnSync(
    process.execPath,
    [script, ghMatch[1], note],
    { stdio: 'inherit', env: process.env }
  );
  process.exit(result.status ?? 1);
}

const key = process.env.LINEAR_API_KEY;
if (!identifier || !key) process.exit(1);
const m = identifier.match(/^JOV-(\d+)$/i);
if (!m) {
  console.error(
    'linear-claim-issue.mjs: expected JOV-NNNN or GitHub issue number'
  );
  process.exit(1);
}
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