#!/usr/bin/env node
/**
 * @deprecated Use scripts/github-query-todo.mjs for GitHub Issues.
 * When TRACKER_GITHUB_ONLY=1, delegates to the GitHub query script.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (process.env.TRACKER_GITHUB_ONLY === '1') {
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    'github-query-todo.mjs'
  );
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

const key = process.env.LINEAR_API_KEY;
if (!key) {
  console.error('LINEAR_API_KEY missing');
  process.exit(1);
}
const query = `query { issues(filter: { team: { key: { eq: "JOV" } }, state: { name: { in: ["Todo", "Triage", "Backlog"] } } }, first: 40, orderBy: updatedAt) { nodes { identifier title priority priorityLabel branchName labels { nodes { name } } description } } }`;
let res;
try {
  res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (!res.ok) {
  const body = await res.text();
  console.error(
    `Linear API request failed (${res.status} ${res.statusText}): ${body}`
  );
  process.exit(1);
}
const data = await res.json();
if (data.errors) {
  console.error(JSON.stringify(data.errors));
  process.exit(1);
}
const skip = i => {
  const ls = (i.labels?.nodes ?? []).map(l => l.name.toLowerCase());
  const t = (i.title + (i.description ?? '')).toLowerCase();
  if (ls.includes('human-review-required')) return true;
  if ((i.description ?? '').includes('This issue requires human review'))
    return true;
  if (
    /lyb-|storekit|revenuecat|body_metric|candidate follow-up|jovieinc\/ci|loop [abc] —/i.test(
      t
    )
  )
    return true;
  if (ls.includes('type:epic')) return true;
  return false;
};
for (const i of (data.data?.issues?.nodes ?? [])
  .filter(i => !skip(i))
  .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4))) {
  console.log(
    [i.identifier, i.priorityLabel ?? 'None', i.branchName ?? '', i.title].join(
      '\t'
    )
  );
}