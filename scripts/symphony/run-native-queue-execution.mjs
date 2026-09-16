#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  assertAutonomousClaim,
  AUTONOMOUS_LINEAR_WORKER,
  executeNativeQueueStarvation,
  selectGreenReadyPrs,
} from './native-queue-starvation-execute.mjs';

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

async function lookupAutonomousWorkerId() {
  const wanted =
    process.env.SUMMER_LINEAR_WORKER_NAME?.trim() || AUTONOMOUS_LINEAR_WORKER;
  const looked = await linearGraphql(
    `query($name: String!) {
      users(first: 10, filter: { name: { eq: $name } }) {
        nodes { id name }
      }
    }`,
    { name: wanted }
  );
  const nodes = looked.users?.nodes;
  const worker = Array.isArray(nodes)
    ? nodes.find(node => node?.name === wanted && typeof node.id === 'string')
    : null;
  if (!worker?.id) throw new Error('linear-worker-missing');
  return worker.id;
}

async function claimIssue({ identifier, state }) {
  const looked = await linearGraphql(
    `query($id: String!) { issue(id: $id) { id identifier state { name } } }`,
    { id: identifier }
  );
  const issue = looked.issue;
  if (!issue?.id) throw new Error('linear-issue-missing');
  const assigneeId = await lookupAutonomousWorkerId();
  const updated = await linearGraphql(
    `mutation($id: String!, $stateId: String!, $assigneeId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId, assigneeId: $assigneeId }) {
        success
        issue { identifier state { name } assignee { name } }
      }
    }`,
    { id: issue.id, stateId: IN_PROGRESS, assigneeId }
  );
  const next = updated.issueUpdate?.issue;
  if (updated.issueUpdate?.success !== true || next?.state?.name !== state) {
    throw new Error('linear-claim-rejected');
  }
  return assertAutonomousClaim({
    state: next.state.name,
    assignee: next.assignee?.name ?? null,
  });
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
  return {
    mutationAllowed: gem.newMutationAllowed === true,
    pushAllowed: remediation.pushAllowed === true,
    maxConcurrent: Number(gem.maxConcurrent ?? 0),
    greenReadyPrs: selectGreenReadyPrs(fleet),
  };
}

function ghJson(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `gh-failed:${String(result.stderr || result.stdout || '').slice(0, 180)}`
    );
  }
  return JSON.parse(result.stdout);
}

async function enrollPr({ pr, head }) {
  const repo = 'JovieInc/Jovie';
  let viewed;
  try {
    viewed = ghJson([
      'pr',
      'view',
      String(pr),
      '--repo',
      repo,
      '--json',
      'number,state,isDraft,mergeStateStatus,headRefOid,baseRefName',
    ]);
  } catch (error) {
    return {
      ok: false,
      reason: String(error instanceof Error ? error.message : error).slice(
        0,
        180
      ),
    };
  }
  if (
    viewed.state !== 'OPEN' ||
    viewed.isDraft === true ||
    viewed.baseRefName !== 'main'
  ) {
    return {
      ok: false,
      reason: `native-queue-pr-not-enrollable:${viewed.state}`,
    };
  }
  if (head && viewed.headRefOid !== head) {
    return { ok: false, reason: 'native-queue-head-drift' };
  }
  if (viewed.mergeStateStatus !== 'CLEAN') {
    return {
      ok: false,
      reason: `native-queue-not-clean:${viewed.mergeStateStatus}`,
    };
  }
  const merged = spawnSync(
    'gh',
    ['pr', 'merge', String(pr), '--repo', repo, '--squash', '--auto'],
    { encoding: 'utf8' }
  );
  if (merged.status !== 0) {
    return {
      ok: false,
      reason: `native-queue-enroll-failed:${String(
        merged.stderr || merged.stdout || ''
      ).slice(0, 180)}`,
    };
  }
  return { ok: true, head: viewed.headRefOid, pr: viewed.number };
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
  enrollPr,
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
