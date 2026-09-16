#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { executeNativeQueueStarvation } from './native-queue-starvation-execute.mjs';

const IN_PROGRESS = '721e032a-fe72-4374-9a61-d9976d079e1e';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing-${name}`);
  return value;
}

async function linearGraphql(query, variables) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: required('SUMMER_LINEAR_GOVERNOR_API_KEY'),
    },
    body: JSON.stringify({ query, variables }),
  });
  // scripts-typecheck (JOV-4327) runs checkJs: response.json() widens to
  // unknown, so parse the text and validate the GraphQL envelope shape the
  // same way summer-symphony-outbox-consumer.mjs does for Linear.
  const body = JSON.parse(await response.text());
  if (!response.ok || body.errors) {
    throw new Error(
      `linear-graphql-failed:${JSON.stringify(body.errors ?? body).slice(0, 200)}`
    );
  }
  return body.data;
}

async function claimIssue({ identifier, state }) {
  const looked = await linearGraphql(
    `query($id: String!) { issue(id: $id) { id identifier state { name } } }`,
    { id: identifier }
  );
  const issue = looked.issue;
  if (!issue?.id) throw new Error('linear-issue-missing');
  const updated = await linearGraphql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue { identifier state { name } assignee { name } }
      }
    }`,
    { id: issue.id, stateId: IN_PROGRESS }
  );
  const next = updated.issueUpdate?.issue;
  if (updated.issueUpdate?.success !== true || next?.state?.name !== state) {
    throw new Error('linear-claim-rejected');
  }
  return {
    state: next.state.name,
    assignee: next.assignee?.name ?? 'symphony-worker',
  };
}

async function writeExecution(record) {
  const origin = required('SUMMER_BOTTLENECK_ORIGIN').replace(/\/$/u, '');
  const headers = { 'content-type': 'application/json' };
  const bypass =
    process.env.SUMMER_BOTTLENECK_VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  const response = await fetch(`${origin}/summer/v1/symphony/executions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(record),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`execution-write-invalid:${response.status}`);
  }
  if (!response.ok) {
    throw new Error(
      `execution-write-rejected:${parsed.code ?? response.status}`
    );
  }
  return parsed;
}

function fleetAdmission(path) {
  const fleet = JSON.parse(readFileSync(path, 'utf8'));
  const gem = fleet.concurrency?.gem ?? {};
  const remediation = fleet.remediationAdmission ?? {};
  const queue = fleet.signals?.queue ?? {};
  return {
    mutationAllowed: gem.newMutationAllowed === true,
    pushAllowed: remediation.pushAllowed === true,
    maxConcurrent: Number(gem.maxConcurrent ?? 0),
    greenReadyPrs: Array.isArray(queue.greenReady)
      ? queue.greenReady
      : Number.isInteger(queue.greenReadyPrs)
        ? Array.from({ length: queue.greenReadyPrs }, (_, i) => i + 1)
        : [],
  };
}

const taskKey = process.argv[2];
const issueIdentifier = process.argv[3];
const sourceVersion = process.argv[4];
const snapshotDigest = process.argv[5];
const fleetPath = process.argv[6];
if (
  !taskKey ||
  !issueIdentifier ||
  !sourceVersion ||
  !snapshotDigest ||
  !fleetPath
) {
  throw new Error(
    'usage: run-native-queue-execution.mjs <taskKey> <issue> <sourceVersion> <snapshotDigest> <fleet.json>'
  );
}

const result = await executeNativeQueueStarvation({
  taskKey,
  issueIdentifier,
  source: { sourceVersion, snapshotDigest },
  admission: fleetAdmission(fleetPath),
  signatureKeyId: required('SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID'),
  privateKeyPem: required(
    'SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY'
  ),
  claimIssue,
  enrollPr: async () => ({
    ok: false,
    reason: 'native-queue-enroll-not-attempted-without-authority',
  }),
  writeExecution,
});
process.stdout.write(`${JSON.stringify(result.decision)}\n`);
process.stdout.write(
  `${JSON.stringify({
    status: result.status,
    taskKey: result.taskKey,
    issueIdentifier: result.issueIdentifier,
    acknowledgement: result.acknowledgement,
    claim: result.claim,
  })}\n`
);
