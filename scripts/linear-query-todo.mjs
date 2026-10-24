#!/usr/bin/env node
import { createLinearClient } from '../packages/api-client/index.ts';

const key = process.env.LINEAR_API_KEY;
if (!key) {
  console.error('LINEAR_API_KEY missing');
  process.exit(1);
}
const query = `query { issues(filter: { team: { key: { eq: "JOV" } }, state: { name: { in: ["Todo", "Triage", "Backlog"] } } }, first: 40, orderBy: updatedAt) { nodes { identifier title priority priorityLabel branchName labels { nodes { name } } description } } }`;
// Intake polling: shed first when the shared Linear budget runs low
// (.claude/rules/external-apis.md), so it never starves claims or transitions.
let data;
try {
  const linear = createLinearClient({
    identity: key,
    authorization: () => key,
  });
  data = { data: await linear.graphql(query, {}, { priority: 'poll' }) };
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(error?.exitCode === 75 ? 75 : 1);
}
const skip = i => {
  const ls = (i.labels?.nodes ?? []).map(l => l.name.toLowerCase());
  const t = (i.title + (i.description ?? '')).toLowerCase();
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
