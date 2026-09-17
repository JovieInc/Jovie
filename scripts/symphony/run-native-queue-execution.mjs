#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  NATIVE_QUEUE_ACTION,
  appendSummerIssueBind,
  assertAutonomousClaim,
  assertAutonomousTerminal,
  executeNativeQueueStarvation,
  nativeQueueEnrollPlan,
  selectGreenReadyPrs,
} from './native-queue-starvation-execute.mjs';

const IN_PROGRESS = '721e032a-fe72-4374-9a61-d9976d079e1e';
const DONE = 'a95b08f1-61f8-438f-ba39-ebd8f8ae6471';

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
      issueUpdate(id: $id, input: { stateId: $stateId, assigneeId: null }) {
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
  return assertAutonomousClaim({
    state: next.state.name,
    assignee: next.assignee?.name ?? null,
  });
}

async function completeIssue({ identifier, state }) {
  const looked = await linearGraphql(
    `query($id: String!) { issue(id: $id) { id identifier state { name } } }`,
    { id: identifier }
  );
  const issue = looked.issue;
  if (!issue?.id) throw new Error('linear-issue-missing');
  const updated = await linearGraphql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId, assigneeId: null }) {
        success
        issue { identifier state { name } assignee { name } }
      }
    }`,
    { id: issue.id, stateId: DONE }
  );
  const next = updated.issueUpdate?.issue;
  if (updated.issueUpdate?.success !== true || next?.state?.name !== state) {
    throw new Error('linear-terminal-rejected');
  }
  return assertAutonomousTerminal({
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

function listCleanOpenPrs() {
  try {
    const rows = ghJson([
      'pr',
      'list',
      '--repo',
      'JovieInc/Jovie',
      '--base',
      'main',
      '--state',
      'open',
      '--limit',
      '40',
      '--json',
      'number,isDraft,mergeStateStatus,headRefOid,baseRefName',
    ]);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        row =>
          row?.isDraft !== true &&
          row?.baseRefName === 'main' &&
          row?.mergeStateStatus === 'CLEAN' &&
          Number.isInteger(row?.number) &&
          typeof row?.headRefOid === 'string'
      )
      .map(row => ({ number: row.number, head: row.headRefOid }));
  } catch {
    return [];
  }
}

function fleetAdmission(path) {
  const fleet = JSON.parse(readFileSync(path, 'utf8'));
  const gem = fleet.concurrency?.gem ?? {};
  const remediation = fleet.remediationAdmission ?? {};
  const fromFleet = selectGreenReadyPrs(fleet);
  return {
    mutationAllowed: gem.newMutationAllowed === true,
    pushAllowed: remediation.pushAllowed === true,
    maxConcurrent: Number(gem.maxConcurrent ?? 0),
    greenReadyPrs: fromFleet.length > 0 ? fromFleet : listCleanOpenPrs(),
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

function bindLinearIdentifier({ pr, repo, issueIdentifier, taskKey, body }) {
  if (
    typeof issueIdentifier !== 'string' ||
    !/^JOV-[1-9][0-9]*$/u.test(issueIdentifier)
  ) {
    return;
  }
  const nextBody = appendSummerIssueBind(body, issueIdentifier, taskKey);
  if (nextBody !== (typeof body === 'string' ? body : '')) {
    spawnSync(
      'gh',
      ['pr', 'edit', String(pr), '--repo', repo, '--body', nextBody],
      { encoding: 'utf8' }
    );
  }
  spawnSync(
    'gh',
    ['pr', 'comment', String(pr), '--repo', repo, '--body', issueIdentifier],
    { encoding: 'utf8' }
  );
}

function mergeQueueEntry(pr) {
  try {
    const payload = ghJson([
      'api',
      'graphql',
      '-f',
      `query={ repository(owner:"JovieInc", name:"Jovie") { pullRequest(number:${Number(pr)}) { mergeQueueEntry { id state enqueuedAt } mergedAt } } }`,
    ]);
    return payload?.data?.repository?.pullRequest ?? null;
  } catch {
    return null;
  }
}

async function enrollPr({ pr, head, issueIdentifier, taskKey }) {
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
      'number,state,isDraft,mergeStateStatus,headRefOid,baseRefName,body',
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
  const live = mergeQueueEntry(viewed.number);
  const plan = nativeQueueEnrollPlan({
    mergeStateStatus: viewed.mergeStateStatus,
    mergeQueueEntry: live?.mergeQueueEntry ?? null,
  });
  if (plan.action === 'reject') {
    return { ok: false, reason: plan.detail };
  }
  bindLinearIdentifier({
    pr: viewed.number,
    repo,
    issueIdentifier,
    taskKey,
    body: viewed.body,
  });
  if (live?.mergedAt || live?.mergeQueueEntry) {
    return { ok: true, head: viewed.headRefOid, pr: viewed.number };
  }
  // itstimwhite `gh pr merge --auto` is ejected in ~50s. Wait for jovie-bot.
  for (let i = 0; i < 12; i += 1) {
    spawnSync('sleep', ['20'], { encoding: 'utf8' });
    const next = mergeQueueEntry(viewed.number);
    if (next?.mergedAt || next?.mergeQueueEntry) {
      return { ok: true, head: viewed.headRefOid, pr: viewed.number };
    }
  }
  return {
    ok: false,
    reason: 'native-queue-waiting-bot-enqueue',
    pr: viewed.number,
    head: viewed.headRefOid,
  };
}

const taskKey = process.argv[2];
const issueIdentifier = process.argv[3];
const sourceVersion = process.argv[4];
const snapshotDigest = process.argv[5];
const fleetPath = process.argv[6];
const action = process.argv[7] || NATIVE_QUEUE_ACTION;
if (
  !taskKey ||
  !issueIdentifier ||
  !sourceVersion ||
  !snapshotDigest ||
  !fleetPath
) {
  throw new Error(
    'usage: run-native-queue-execution.mjs <taskKey> <issue> <sourceVersion> <snapshotDigest> <fleet.json> [action]'
  );
}

const result = await executeNativeQueueStarvation({
  taskKey,
  issueIdentifier,
  source: { sourceVersion, snapshotDigest },
  admission: { ...fleetAdmission(fleetPath), action },
  signatureKeyId: required('SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID'),
  privateKeyPem: required(
    'SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY'
  ),
  claimIssue,
  completeIssue,
  enrollPr,
  writeExecution,
});
process.stdout.write(
  `${JSON.stringify({
    status: result.status,
    taskKey: result.taskKey,
    issueIdentifier: result.issueIdentifier,
    detail: result.decision?.detail,
    pr: result.decision?.pr ?? null,
    acknowledgement: result.acknowledgement,
    claim: result.claim,
    terminal: result.terminal,
    decision: result.decision,
  })}\n`
);
