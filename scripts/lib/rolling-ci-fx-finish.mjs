#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { latestOpinionatedReviewsByReviewer } from './merge-group-member-policy.mjs';
import { validateLiveMergeQueueRuleset } from './merge-queue-guard.mjs';
import { checkFailures } from './native-queue-policy-evidence.mjs';
import { validateHostedAcceptance } from './rolling-ci-fx.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const FX_WORKFLOW = '.github/workflows/rolling-ci-dispatch.yml';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const TERMINAL_SCHEMA = 'jovie-hosted-ci-terminal-receipt/v1';
const MAX_ARTIFACT_AGE_MS = 24 * 60 * 60 * 1000;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const HOLD_LABELS = new Set(['hold', 'gated', 'incident']);

const sha256 = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;
const age = (timestamp, now) => now - Date.parse(timestamp);
const fresh = (timestamp, now) => {
  const elapsed = age(timestamp, now);
  return (
    Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= MAX_ARTIFACT_AGE_MS
  );
};
const nonaction = reason => ({ eligible: false, reason });

function completePage(page, key) {
  return (
    positive(page?.total_count) &&
    Array.isArray(page?.[key]) &&
    page.total_count === page[key].length &&
    page[key].length < 100
  );
}

function one(items) {
  return items.length === 1 ? items[0] : null;
}

export function discoverFxRepair({
  prNumber,
  repairedHead,
  commit,
  patchArtifacts,
  writeArtifacts,
  terminalArtifacts,
  now = Date.now(),
}) {
  if (!positive(prNumber) || !SHA.test(repairedHead))
    return nonaction('invalid-pr-or-head');
  const parent = one(commit?.parents ?? [])?.sha;
  const tree = commit?.tree?.sha;
  if (
    commit?.sha !== repairedHead ||
    !SHA.test(parent ?? '') ||
    !SHA.test(tree ?? '')
  )
    return nonaction('repaired-commit-lineage-missing');
  if (
    !completePage(patchArtifacts, 'artifacts') ||
    !completePage(writeArtifacts, 'artifacts') ||
    !completePage(terminalArtifacts, 'artifacts')
  ) {
    return nonaction('artifact-inventory-incomplete');
  }
  const expectedPatchName = `hosted-ci-patch-${prNumber}-${parent}`;
  const expectedWriteName = `hosted-ci-write-receipts-${prNumber}-${parent}`;
  const expectedTerminalName = `hosted-ci-terminal-${prNumber}-${parent}`;
  const select = (page, name) =>
    page.artifacts.filter(artifact => artifact?.name === name);
  const patch = one(select(patchArtifacts, expectedPatchName));
  const write = one(select(writeArtifacts, expectedWriteName));
  const terminal = one(select(terminalArtifacts, expectedTerminalName));
  if (!patch || !write || !terminal)
    return nonaction('artifact-lineage-missing-or-ambiguous');
  if (
    !positive(patch.id) ||
    !positive(write.id) ||
    !positive(terminal.id) ||
    patch.id === write.id ||
    patch.id === terminal.id ||
    write.id === terminal.id ||
    patch.expired !== false ||
    write.expired !== false ||
    terminal.expired !== false ||
    !fresh(patch.created_at, now) ||
    !fresh(write.created_at, now) ||
    !fresh(terminal.created_at, now) ||
    !positive(write.workflow_run?.id) ||
    patch.workflow_run?.id !== write.workflow_run.id ||
    write.workflow_run.id !== terminal.workflow_run?.id ||
    patch.workflow_run?.head_sha !== write.workflow_run.head_sha ||
    write.workflow_run.head_sha !== terminal.workflow_run?.head_sha
  ) {
    return nonaction('artifact-lineage-invalid-or-expired');
  }
  return {
    eligible: true,
    prNumber,
    repairedHead,
    parent,
    tree,
    runId: write.workflow_run.id,
    patch,
    write,
    terminal,
  };
}

function jobProvesArtifact(jobs, name, artifact) {
  const job = one(jobs.filter(item => item.name === name));
  if (
    !job ||
    !positive(job.id) ||
    job.status !== 'completed' ||
    job.conclusion !== 'success'
  )
    return false;
  const created = Date.parse(artifact.created_at);
  const started = Date.parse(job.started_at);
  const completed = Date.parse(job.completed_at);
  return (
    Number.isFinite(created) &&
    Number.isFinite(started) &&
    Number.isFinite(completed) &&
    created >= started - 120_000 &&
    created <= completed + 120_000
  );
}

export function validateFxRepairLineage({
  discovery,
  run,
  jobsPage,
  plan,
  patchBytes,
  acceptance,
  writerTerminal,
  publishedTerminal,
  now = Date.now(),
}) {
  if (discovery?.eligible !== true) return nonaction('discovery-not-eligible');
  if (
    run?.id !== discovery.runId ||
    run.name !== 'Rolling CI Dispatch' ||
    run.path !== FX_WORKFLOW ||
    run.event !== 'workflow_run' ||
    run.head_branch !== 'main' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !positive(run.run_attempt) ||
    run.head_sha !== discovery.write.workflow_run.head_sha ||
    !completePage(jobsPage, 'jobs') ||
    !jobProvesArtifact(
      jobsPage.jobs,
      'FX patch artifact without GitHub authority',
      discovery.patch
    ) ||
    !jobProvesArtifact(
      jobsPage.jobs,
      'Validate acceptance and atomically update exact PR head',
      discovery.write
    ) ||
    !jobProvesArtifact(
      jobsPage.jobs,
      'Publish typed terminal receipt',
      discovery.terminal
    )
  ) {
    return nonaction('trusted-run-or-job-provenance-invalid');
  }
  const common = receipt =>
    receipt?.repository === REPOSITORY &&
    receipt.prNumber === discovery.prNumber &&
    receipt.expectedHeadOid === discovery.parent &&
    typeof receipt.fingerprint === 'string' &&
    receipt.fingerprint.startsWith('ci:') &&
    typeof receipt.idempotencyKey === 'string' &&
    receipt.idempotencyKey.length > 0 &&
    fresh(receipt.observedAt, now);
  const validated = validateHostedAcceptance({ plan, acceptance, patchBytes });
  if (
    !validated.accepted ||
    plan.expectedHeadOid !== discovery.parent ||
    plan.prNumber !== discovery.prNumber ||
    !common(acceptance) ||
    acceptance.testTreeSha !== discovery.tree ||
    !SHA.test(acceptance.testCommitOid ?? '') ||
    !DIGEST.test(acceptance.patchSha256 ?? '') ||
    !DIGEST.test(acceptance.testReportSha256 ?? '') ||
    !positive(Number(acceptance.workflowRunId)) ||
    Number(acceptance.workflowRunId) !== run.id ||
    acceptance.workflowRunAttempt !== run.run_attempt ||
    Number(acceptance.patchArtifactId) !== discovery.patch.id ||
    !positive(Number(acceptance.testArtifactId)) ||
    !Array.isArray(acceptance.changedFiles)
  ) {
    return nonaction('acceptance-lineage-invalid');
  }
  const terminalValid = terminal =>
    terminal?.schema === TERMINAL_SCHEMA &&
    terminal.stage === 'terminal' &&
    terminal.status === 'completed' &&
    terminal.terminal === true &&
    terminal.outcome === 'repaired' &&
    common(terminal) &&
    terminal.committedHeadOid === discovery.repairedHead &&
    terminal.policyVersion === acceptance.policyVersion &&
    terminal.fingerprint === acceptance.fingerprint &&
    terminal.idempotencyKey === acceptance.idempotencyKey &&
    terminal.acceptanceSha256 === sha256(JSON.stringify(acceptance));
  if (
    !terminalValid(writerTerminal) ||
    !terminalValid(publishedTerminal) ||
    JSON.stringify(writerTerminal) !== JSON.stringify(publishedTerminal)
  ) {
    return nonaction('terminal-lineage-or-digest-invalid');
  }
  return { eligible: true, reason: 'trusted-fx-repair' };
}

export function validateFxNativeState({
  discovery,
  pr,
  ciRuns,
  successRunId,
  successRunAttempt,
  checks,
  statuses,
  reviews,
  ruleset,
  activationEnabled,
  activationCanaryPr,
}) {
  if (
    activationEnabled !== 'true' ||
    activationCanaryPr !== String(discovery.prNumber)
  ) {
    return nonaction('canary-disabled-or-mismatched');
  }
  if (
    pr?.number !== discovery.prNumber ||
    pr.state !== 'open' ||
    pr.draft !== false ||
    pr.base?.ref !== 'main' ||
    pr.base?.repo?.full_name !== REPOSITORY ||
    pr.head?.repo?.full_name !== REPOSITORY ||
    pr.head?.repo?.fork === true ||
    pr.head?.sha !== discovery.repairedHead ||
    pr.mergeable !== true ||
    !Array.isArray(pr.labels) ||
    pr.labels.some(label => HOLD_LABELS.has(label?.name))
  ) {
    return nonaction('live-pr-head-or-hold');
  }
  if (!completePage(ciRuns, 'workflow_runs'))
    return nonaction('ci-run-inventory-incomplete');
  const latestCi = ciRuns.workflow_runs
    .filter(
      run =>
        run.name === 'CI' &&
        run.path === CI_WORKFLOW &&
        run.event === 'pull_request' &&
        run.head_sha === discovery.repairedHead
    )
    .sort((left, right) => right.id - left.id)[0];
  if (
    latestCi?.id !== successRunId ||
    latestCi.run_attempt !== successRunAttempt ||
    latestCi.status !== 'completed' ||
    latestCi.conclusion !== 'success'
  ) {
    return nonaction('successful-ci-attempt-stale-or-untrusted');
  }
  if (!completePage(checks, 'check_runs'))
    return nonaction('check-inventory-incomplete');
  if (!Array.isArray(statuses) || statuses.length >= 100)
    return nonaction('status-inventory-incomplete');
  const required = ruleset?.rules?.find(
    rule => rule?.type === 'required_status_checks'
  )?.parameters?.required_status_checks;
  if (!Array.isArray(required) || required.length === 0)
    return nonaction('required-check-policy-unavailable');
  const checkEvidence = [
    ...checks.check_runs.map(check => ({
      id: check.id,
      name: check.name,
      sha: check.head_sha,
      appId: check.app?.id,
      startedAt: check.started_at,
      completedAt: check.completed_at,
      state:
        check.status === 'completed' && check.conclusion === 'success'
          ? 'success'
          : (check.status ?? 'unknown'),
    })),
    ...statuses.map(status => ({
      id: status.id,
      name: status.context,
      sha: discovery.repairedHead,
      startedAt: status.created_at,
      completedAt: status.updated_at,
      state: status.state,
    })),
  ];
  if (checkFailures(checkEvidence, required, discovery.repairedHead).length)
    return nonaction('required-checks-not-success');
  if (!Array.isArray(reviews) || reviews.length >= 100)
    return nonaction('review-inventory-incomplete');
  try {
    if (
      [...latestOpinionatedReviewsByReviewer(reviews).values()].some(
        review => review.state === 'CHANGES_REQUESTED'
      )
    )
      return nonaction('blocking-review');
  } catch {
    return nonaction('review-inventory-invalid');
  }
  if (
    ruleset?.id !== 10512119 ||
    ruleset.enforcement !== 'active' ||
    ruleset.target !== 'branch' ||
    JSON.stringify(ruleset.conditions?.ref_name?.include) !==
      JSON.stringify(['refs/heads/main']) ||
    JSON.stringify(ruleset.conditions?.ref_name?.exclude) !==
      JSON.stringify([]) ||
    !validateLiveMergeQueueRuleset(ruleset).ok
  ) {
    return nonaction('native-queue-ruleset-not-enforced');
  }
  return { eligible: true, reason: 'native-request-eligible' };
}

export function classifyNativeReadback({ pr, expectedHead }) {
  if (pr?.headRefOid !== expectedHead) return 'head-changed';
  if (pr.state === 'MERGED') return 'merged-needs-queue-proof';
  if (pr.state !== 'OPEN') return 'pr-closed';
  if (pr.mergeQueueEntry) return 'queued';
  if (pr.autoMergeRequest) return 'intent-recorded';
  return 'no-intent';
}

export async function requestVerifiedNativeMerge({ readState, mutate }) {
  const prior = await readState();
  if (prior === 'queued' || prior === 'intent-recorded') return prior;
  if (prior !== 'no-intent')
    throw new Error(`native request refused: ${prior}`);
  let mutationFailed = false;
  try {
    await mutate();
  } catch {
    mutationFailed = true;
  }
  const state = await readState();
  if (state === 'queued' || state === 'intent-recorded') return state;
  throw new Error(
    `native request ${mutationFailed ? 'was uncertain' : 'had no durable intent'}: ${state}; no retry`
  );
}

async function githubJson(path, token) {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}${path}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (!response.ok)
    throw new Error(`GitHub GET ${path} returned ${response.status}`);
  return response.json();
}

function argsOf(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith('--') || values[index + 1] === undefined)
      throw new Error('expected --name value argument pairs');
    args[values[index].slice(2)] = values[index + 1];
  }
  return args;
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value)}\n`);
const output = (key, value) =>
  writeFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, { flag: 'a' });

export async function discoverCommand(
  args,
  { request = githubJson, now = Date.now() } = {}
) {
  const prNumber = Number(args.pr);
  const repairedHead = args.head;
  if (!positive(prNumber) || !SHA.test(repairedHead ?? ''))
    throw new Error('invalid PR or exact head');
  const commit = await request(
    `/git/commits/${repairedHead}`,
    process.env.GH_TOKEN
  );
  const parent = one(commit?.parents ?? [])?.sha;
  if (!SHA.test(parent ?? '')) return output('eligible', 'false');
  const names = [
    `hosted-ci-patch-${prNumber}-${parent}`,
    `hosted-ci-write-receipts-${prNumber}-${parent}`,
    `hosted-ci-terminal-${prNumber}-${parent}`,
  ];
  const [patchArtifacts, writeArtifacts, terminalArtifacts] = await Promise.all(
    names.map(name =>
      request(
        `/actions/artifacts?per_page=100&name=${name}`,
        process.env.GH_TOKEN
      )
    )
  );
  const discovery = discoverFxRepair({
    prNumber,
    repairedHead,
    commit,
    patchArtifacts,
    writeArtifacts,
    terminalArtifacts,
    now,
  });
  if (!discovery.eligible) {
    output('eligible', 'false');
    output('reason', discovery.reason);
    return;
  }
  const run = await request(
    `/actions/runs/${discovery.runId}`,
    process.env.GH_TOKEN
  );
  if (!positive(run?.run_attempt)) {
    output('eligible', 'false');
    output('reason', 'trusted-run-attempt-missing');
    return;
  }
  const jobsPage = await request(
    `/actions/runs/${discovery.runId}/attempts/${run.run_attempt}/jobs?per_page=100`,
    process.env.GH_TOKEN
  );
  writeJson(args.output, { discovery, run, jobsPage });
  output('eligible', 'true');
  output('run_id', discovery.runId);
  output('patch_artifact_id', discovery.patch.id);
  output('write_artifact_id', discovery.write.id);
  output('terminal_artifact_id', discovery.terminal.id);
}

async function nativeState(discovery, args, token, request = githubJson) {
  const [pr, ciRuns, checks, statuses, reviews, ruleset] = await Promise.all([
    request(`/pulls/${discovery.prNumber}`, token),
    request(
      `/actions/runs?event=pull_request&head_sha=${discovery.repairedHead}&per_page=100`,
      token
    ),
    request(
      `/commits/${discovery.repairedHead}/check-runs?per_page=100`,
      token
    ),
    request(`/commits/${discovery.repairedHead}/statuses?per_page=100`, token),
    request(`/pulls/${discovery.prNumber}/reviews?per_page=100`, token),
    request('/rulesets/10512119', token),
  ]);
  return validateFxNativeState({
    discovery,
    pr,
    ciRuns,
    checks,
    statuses,
    reviews,
    ruleset,
    successRunId: Number(args['success-run-id']),
    successRunAttempt: Number(args['success-run-attempt']),
    activationEnabled: process.env.FX_HOSTED_REMEDIATION_ENABLED,
    activationCanaryPr: process.env.FX_HOSTED_REMEDIATION_CANARY_PR,
  });
}

export async function authorizeCommand(
  args,
  { request = githubJson, now = Date.now() } = {}
) {
  if (
    ![
      args.discovery,
      args.plan,
      args.patch,
      args.acceptance,
      args['writer-terminal'],
      args['published-terminal'],
    ].every(path => path && existsSync(path))
  ) {
    output('eligible', 'false');
    output('reason', 'repair-artifact-missing-after-discovery');
    return;
  }
  const { discovery, run, jobsPage } = readJson(args.discovery);
  const lineage = validateFxRepairLineage({
    discovery,
    run,
    jobsPage,
    plan: readJson(args.plan),
    patchBytes: readFileSync(args.patch),
    acceptance: readJson(args.acceptance),
    writerTerminal: readJson(args['writer-terminal']),
    publishedTerminal: readJson(args['published-terminal']),
    now,
  });
  if (!lineage.eligible) {
    output('eligible', 'false');
    output('reason', lineage.reason);
    return;
  }
  const live = await nativeState(
    discovery,
    args,
    process.env.GH_TOKEN,
    request
  );
  output('eligible', String(live.eligible));
  output('reason', live.reason);
}

export async function readback(prNumber, expectedHead, token, run = spawnSync) {
  const query =
    'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){state headRefOid mergeQueueEntry{id state} autoMergeRequest{enabledAt} mergeCommit{oid}}}}';
  const result = run(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      'owner=JovieInc',
      '-f',
      'repo=Jovie',
      '-F',
      `number=${prNumber}`,
      '--jq',
      '.data.repository.pullRequest',
    ],
    { encoding: 'utf8', env: { ...process.env, GH_TOKEN: token } }
  );
  if (result.status !== 0) throw new Error('native intent readback failed');
  return classifyNativeReadback({
    pr: JSON.parse(result.stdout),
    expectedHead,
  });
}

async function requestCommand(args) {
  const { discovery } = readJson(args.discovery);
  const token = process.env.GH_TOKEN;
  const live = await nativeState(discovery, args, token);
  if (!live.eligible) throw new Error(`native request refused: ${live.reason}`);
  const state = await requestVerifiedNativeMerge({
    readState: () =>
      readback(discovery.prNumber, discovery.repairedHead, token),
    mutate: () => {
      const result = spawnSync(
        'gh',
        [
          'pr',
          'merge',
          String(discovery.prNumber),
          '-R',
          REPOSITORY,
          '--auto',
          '--match-head-commit',
          discovery.repairedHead,
        ],
        { encoding: 'utf8', env: { ...process.env, GH_TOKEN: token } }
      );
      if (result.status !== 0)
        throw new Error('native merge request response was not successful');
    },
  });
  output('result', state);
}

async function main() {
  const [command, ...values] = process.argv.slice(2);
  const args = argsOf(values);
  if (command === 'discover') return discoverCommand(args);
  if (command === 'authorize') return authorizeCommand(args);
  if (command === 'request') return requestCommand(args);
  throw new Error('unknown FX native finish command');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
