#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TODO_STATE_ID } from './backlog-orchestrator/stale-lease-guard.mjs';
import {
  buildPrFleetClosureAudit,
  evaluateRecoveryCandidate,
  findOfficialSymphonyLease,
  hasCompletePatch,
  hasFleetClosureRemediationLease,
  renderFleetClosureRemediationLease,
  renderPrFleetClosureAudit,
  renderRecoveryReceipt,
} from './lib/ownerless-recovery-policy.mjs';
import { classifyQueueCheckBlockers } from './lib/pr-check-failures.mjs';
import { readPullRequestQueueState } from './merge-queue-backend.mjs';

const execFileAsync = promisify(execFile);
const repo =
  process.env.REPO || process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const dryRun = /^(1|true)$/i.test(process.env.DRY_RUN || 'false');
const EXACT_SHA = /^[0-9a-f]{40}$/;
const JOVIE_LINEAR_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
const OFFICIAL_SYMPHONY_STATE_URL =
  process.env.SYMPHONY_STATE_URL || 'http://127.0.0.1:4041/api/v1/state';

async function gh(args) {
  const { stdout } = await execFileAsync('gh', args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function ghJson(args) {
  const output = await gh(args);
  return output ? JSON.parse(output) : null;
}

const apiJson = endpoint => ghJson(['api', endpoint]);
const prCommand = (command, number, ...args) =>
  gh(['pr', command, String(number), '-R', repo, ...args]);

async function mainHead() {
  return gh(['api', `repos/${repo}/git/ref/heads/main`, '--jq', '.object.sha']);
}

async function policyHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    env: process.env,
  });
  return stdout.trim();
}

export async function resolveExactMainPolicyHead(dependencies = {}) {
  const { mainHeadImpl = mainHead, policyHeadImpl = policyHead } = dependencies;
  const [checkedOutHead, liveMain] = await Promise.all([
    policyHeadImpl(),
    mainHeadImpl(),
  ]);
  if (!EXACT_SHA.test(checkedOutHead) || !EXACT_SHA.test(liveMain)) {
    throw new Error(
      'ownerless recovery requires exact lowercase policy and main SHAs'
    );
  }
  if (checkedOutHead !== liveMain) {
    throw new Error(
      `ownerless recovery policy head ${checkedOutHead} is not live main ${liveMain}`
    );
  }
  return liveMain;
}

const openPulls = (base = '') =>
  pages(
    `repos/${repo}/pulls?state=open${base ? `&base=${base}` : ''}&per_page=100`
  );

async function linearActiveIssueSnapshot() {
  const linear = await import('./backlog-orchestrator/linear-client.mjs');
  return linear.fetchTeamFleetClosureIssueSnapshot(JOVIE_LINEAR_TEAM_ID);
}

async function linearClient() {
  return import('./backlog-orchestrator/linear-client.mjs');
}

export async function fetchOfficialSymphonyState({
  fetchImpl = globalThis.fetch,
  url = OFFICIAL_SYMPHONY_STATE_URL,
} = {}) {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response?.ok) {
      return {
        source: 'official-symphony-state',
        error: `http-${response?.status || 'unknown'}`,
      };
    }
    const body = await response.json();
    return {
      ...(body && typeof body === 'object' ? body : {}),
      source: 'official-symphony-state',
    };
  } catch (error) {
    return {
      source: 'official-symphony-state',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function prPacketMap(linearIssues) {
  const packetIssue = linearIssues.find(
    issue => String(issue?.identifier || '').toUpperCase() === 'JOV-5610'
  );
  const text = [
    packetIssue?.title,
    packetIssue?.description,
    ...(packetIssue?.comments?.nodes ?? packetIssue?.comments ?? []).map(
      comment => comment?.body ?? comment
    ),
  ].join('\n');
  return Object.fromEntries(
    [...text.matchAll(/\b(?:PR\s*#|pull\/)(\d+)\b/gi)].map(match => [
      match[1],
      'JOV-5610',
    ])
  );
}

async function pages(endpoint) {
  const value = await ghJson([
    'api',
    '--paginate',
    '--slurp',
    '-H',
    'Accept: application/vnd.github+json',
    endpoint,
  ]);
  return (value ?? []).flat();
}

async function checksAreGreen(number) {
  const args = [
    'pr',
    'checks',
    String(number),
    '-R',
    repo,
    '--json',
    'name,bucket,state,workflow,description,startedAt,completedAt',
  ];
  const passing = checks =>
    checks?.length > 0 && classifyQueueCheckBlockers(checks).length === 0;
  try {
    return passing(await ghJson(args));
  } catch (error) {
    const stdout = error?.stdout?.trim();
    if (!stdout) return false;
    try {
      return passing(JSON.parse(stdout));
    } catch {
      return false;
    }
  }
}

async function repoGraph(query, fields = {}) {
  const [owner, name] = repo.split('/');
  const variables = Object.entries({ owner, name, ...fields }).flatMap(
    ([key, value]) => ['-F', `${key}=${value}`]
  );
  const data = await ghJson([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    ...variables,
  ]);
  return data?.data?.repository;
}

async function openStackHeadShas(mainSha) {
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:100){pageInfo{hasNextPage} nodes{number headRefOid commits(first:100){pageInfo{hasNextPage} nodes{commit{oid}}} timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT],first:100){pageInfo{hasNextPage} nodes{... on HeadRefForcePushedEvent{beforeCommit{oid} afterCommit{oid}}}}}}}}`;
  const pulls = (await repoGraph(query))?.pullRequests;
  if (!pulls || pulls.pageInfo.hasNextPage)
    throw new Error('open PR heads incomplete');
  if (
    pulls.nodes.some(
      pr =>
        pr.commits.pageInfo.hasNextPage || pr.timelineItems.pageInfo.hasNextPage
    )
  ) {
    throw new Error('open PR head history incomplete');
  }
  const stackHeads = pulls.nodes.flatMap(pr =>
    [pr.headRefOid, ...pr.commits.nodes.map(node => node.commit.oid)]
      .filter(Boolean)
      .map(sha => ({ number: pr.number, sha }))
  );
  const priorHeads = pulls.nodes.flatMap(pr =>
    pr.timelineItems.nodes
      .map(event => event.beforeCommit?.oid)
      .filter(Boolean)
      .map(sha => ({ number: pr.number, sha }))
  );
  const priorCommits = await Promise.all(
    priorHeads.map(async prior => {
      const comparison = await apiJson(
        `repos/${repo}/compare/${mainSha}...${prior.sha}`
      );
      if (comparison.commits.length !== comparison.total_commits) {
        throw new Error('open PR force-push ancestry incomplete');
      }
      return comparison.commits.map(commit => ({
        number: prior.number,
        sha: commit.sha,
      }));
    })
  );
  return [...stackHeads, ...priorCommits.flat()];
}

async function upsertReceipt(number, body, dedupeKey) {
  await execFileAsync(
    'bash',
    [
      'scripts/lib/upsert-pr-comment.sh',
      String(number),
      'ownerless-recovery',
      body,
      dedupeKey,
    ],
    {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repo,
        BOT_COMMENT_TRUSTED_AUTHORS_JSON: '["jovie-bot[bot]"]',
      },
      maxBuffer: 5 * 1024 * 1024,
    }
  );
}

async function candidateEvidence(summary, mainSha, openHeadShas) {
  const number = summary.number;
  const pr = await apiJson(`repos/${repo}/pulls/${number}`);
  const timeline = await pages(
    `repos/${repo}/issues/${number}/timeline?per_page=100`
  );
  const changed = await pages(
    `repos/${repo}/pulls/${number}/files?per_page=100`
  );
  const files = changed.map(file => file.filename);
  const patchComplete = changed.every(hasCompletePatch);
  const patch = changed
    .filter(file => typeof file.patch === 'string')
    .map(file => file.patch)
    .join('\n');
  const commits = await pages(
    `repos/${repo}/pulls/${number}/commits?per_page=100`
  );
  const commitShas = new Set(commits.map(commit => commit.sha));
  const containsOpenPrHead =
    commits.length !== pr.commits ||
    openHeadShas.some(
      candidate => candidate.number !== number && commitShas.has(candidate.sha)
    );
  const compare = await apiJson(
    `repos/${repo}/compare/${mainSha}...${pr.head.sha}`
  );
  return {
    pr,
    timeline,
    files,
    patch,
    patchComplete,
    containsOpenPrHead,
    compare,
  };
}

const dispatchExactAdmission = (
  number,
  expectedHead,
  mainSha,
  ownerlessSince
) =>
  gh([
    'api',
    '-X',
    'POST',
    `repos/${repo}/dispatches`,
    '-f',
    'event_type=ownerless-recovery-admission',
    '-F',
    `client_payload[pr_number]=${number}`,
    '-f',
    `client_payload[head_sha]=${expectedHead}`,
    '-f',
    `client_payload[main_sha]=${mainSha}`,
    '-f',
    `client_payload[ownerless_since]=${ownerlessSince}`,
  ]);

export function classifyQueueOwnership(queueState, expectedHead) {
  if (
    !queueState ||
    queueState.headRefOid?.toLowerCase() !== expectedHead.toLowerCase()
  ) {
    return { action: 'fail', outcome: 'queue-ownership-head-mismatch' };
  }
  if (queueState.queued === true) {
    return { action: 'no_dispatch', outcome: 'already-delegated-exact-head' };
  }
  if (queueState.autoMergeEnabled === true) {
    return { action: 'fail', outcome: 'foreign-auto-merge-hold' };
  }
  return { action: 'dispatch', outcome: 'unowned-exact-head' };
}
export const countsAsRecoveryFailure = result => !result.queued && result.pending === false && !result.dryRun;

// biome-ignore format: compacted to keep the recovery PR inside the enforced size guard.
export async function dispatchRecoveryIntent(summary, mainSha, evidence, decision, dependencies = {}) { const deps = { apiJsonImpl: apiJson, checksAreGreenImpl: checksAreGreen, dispatchExactAdmissionImpl: dispatchExactAdmission, evaluateRecoveryCandidateImpl: evaluateRecoveryCandidate, mainHeadImpl: mainHead, nowImpl: () => new Date().toISOString(), pagesImpl: pages, prCommandImpl: prCommand, readPullRequestQueueStateImpl: readPullRequestQueueState, upsertReceiptImpl: upsertReceipt, ...dependencies }; const number = summary.number; const expectedHead = evidence.pr.head.sha; if (dryRun) { console.log(`[dry-run] #${number} eligible: ${decision.lanes.join(',')}`); return { queued: false, dryRun: true }; } const [liveMain, live, liveTimeline] = await Promise.all([deps.mainHeadImpl(), deps.apiJsonImpl(`repos/${repo}/pulls/${number}`), deps.pagesImpl(`repos/${repo}/issues/${number}/timeline?per_page=100`)]); const liveDecision = deps.evaluateRecoveryCandidateImpl({ ...evidence, pr: live, timeline: liveTimeline, mainSha: liveMain, checksPassing: await deps.checksAreGreenImpl(number) }); if (liveMain !== mainSha || live.head.sha !== expectedHead || !liveDecision.eligible) { console.log(`#${number} changed before mutation; skipped`); return { queued: false }; } const writeReceipt = outcome => deps.upsertReceiptImpl(number, renderRecoveryReceipt({ pr: number, head: expectedHead, main: mainSha, ownerlessSince: liveDecision.ownerlessSince, lanes: liveDecision.lanes, action: 'dispatch-to-merge-queue-autoenroll', outcome, observedAt: deps.nowImpl() }), `${expectedHead}-${outcome}`); let ownership; try { const queueArgs = /** @type {any} */ ({ backend: 'native', repository: repo, number }); ownership = classifyQueueOwnership(await deps.readPullRequestQueueStateImpl(queueArgs), expectedHead); } catch (error) { await writeReceipt('queue-ownership-read-failed'); throw error; } if (ownership.action === 'no_dispatch') { await writeReceipt(ownership.outcome); console.log(`#${number} exact head is already in the native queue`); return { queued: true, pending: false }; } if (ownership.action === 'fail') { await writeReceipt(ownership.outcome); return { queued: false, pending: false }; } await writeReceipt('attempting'); const compensate = async () => { const failures = []; const current = await deps.apiJsonImpl(`repos/${repo}/pulls/${number}`).catch(() => null); if (!current) failures.push('state-read'); if (live.draft && current?.draft !== true) await deps.prCommandImpl('ready', number, '--undo').catch(() => failures.push('draft-restore')); return failures; }; try { if (live.draft) await deps.prCommandImpl('ready', number); const [postMain, postPr] = await Promise.all([deps.mainHeadImpl(), deps.apiJsonImpl(`repos/${repo}/pulls/${number}`)]); if (postMain !== mainSha || postPr.head.sha !== expectedHead) { const failures = await compensate(); await writeReceipt(failures.length === 0 ? 'promotion-compensated' : `promotion-compensation-failed:${failures.join(',')}`); return { queued: false }; } if (live.draft) { await writeReceipt('promoted-awaiting-checks'); return { queued: false, pending: true }; } if (!(await deps.checksAreGreenImpl(number))) { const failures = await compensate(); await writeReceipt(failures.length === 0 ? 'checks-changed-compensated' : `checks-changed-compensation-failed:${failures.join(',')}`); return { queued: false }; } await deps.dispatchExactAdmissionImpl(number, expectedHead, mainSha, liveDecision.ownerlessSince); } catch (error) { const failures = await compensate(); await writeReceipt(failures.length === 0 ? 'dispatch-failed-compensated' : `dispatch-failed-compensation-failed:${failures.join(',')}`); throw error; } await writeReceipt('delegated-exact-head-admission'); console.log(`#${number} recovery action: delegated exact head to Merge Queue Auto-Enroll`); return { queued: false, pending: true }; }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mutationSucceeded = result =>
  result === undefined ||
  result === true ||
  (result !== false &&
    result?.success !== false &&
    [result?.commentCreate?.success, result?.issueUpdate?.success]
      .filter(value => value !== undefined)
      .every(Boolean));
const stateName = issue =>
  String(issue?.state?.name || issue?.state || '').trim();

// biome-ignore format: compacted to keep the recovery PR inside the enforced size guard.
export async function processFleetClosureRemediationIntents(audit, dependencies = {}) { const deps = { clientImpl: null, fetchOfficialSymphonyStateImpl: fetchOfficialSymphonyState, nowImpl: () => new Date().toISOString(), sleepImpl: sleep, symphonyReadbackAttempts: 3, symphonyReadbackDelayMs: 1000, todoStateId: process.env.FLEET_REMEDIATION_TODO_STATE_ID || TODO_STATE_ID, todoStateName: 'Todo', ...dependencies }; const client = deps.clientImpl ?? (await linearClient()); const waitLease = async identifier => { let last = { ok: false, reason: 'symphony-state-not-read' }; for (let attempt = 1; attempt <= deps.symphonyReadbackAttempts; attempt += 1) { try { last = findOfficialSymphonyLease(await deps.fetchOfficialSymphonyStateImpl(), identifier, { now: new Date(deps.nowImpl()) }); } catch (error) { last = { ok: false, reason: 'symphony-state-read-threw', error: error instanceof Error ? error.message : String(error) }; } if (last.ok) return { ...last, attempts: attempt }; if (attempt < deps.symphonyReadbackAttempts) await deps.sleepImpl(deps.symphonyReadbackDelayMs); } return { ...last, attempts: deps.symphonyReadbackAttempts }; }; const results = []; for (const intent of (audit?.remediationIntents ?? []).filter(intent => intent?.action === 'reattach-remediation-lane' && intent.issue)) { const record = (status, extra = {}) => results.push({ ...intent, status, ...extra }); const fail = (reason, extra = {}) => record('failed', { reason, ...extra }); let issue = await client.fetchIssue(intent.issue); if (!issue?.id) { fail('issue-read-failed'); continue; } const currentLease = await waitLease(intent.issue); if (currentLease.ok) { record('idempotent', { readback: currentLease }); continue; } if (currentLease.reason !== 'symphony-lease-readback-missing') { fail(currentLease.reason, { readback: currentLease }); continue; } try { if (!hasFleetClosureRemediationLease(issue, intent)) { const created = await client.addComment(issue.id, renderFleetClosureRemediationLease({ ...intent, observedAt: deps.nowImpl() })); if (!mutationSucceeded(created)) { fail('intent-create-failed'); continue; } issue = await client.fetchIssue(intent.issue); if (!hasFleetClosureRemediationLease(issue, intent)) { fail('intent-readback-missing'); continue; } } if (stateName(issue) !== deps.todoStateName) { if (typeof client.transitionIssue !== 'function') { fail('linear-transition-unavailable'); continue; } if (!mutationSucceeded(await client.transitionIssue(issue.id, deps.todoStateId))) { fail('linear-transition-failed'); continue; } issue = await client.fetchIssue(intent.issue); if (stateName(issue) !== deps.todoStateName || !hasFleetClosureRemediationLease(issue, intent)) { fail('linear-transition-readback-missing'); continue; } } } catch (error) { fail('linear-mutation-threw', { error: error instanceof Error ? error.message : String(error) }); continue; } const lease = await waitLease(intent.issue); lease.ok ? record('reattached', { readback: lease }) : fail(lease.reason, { readback: lease }); } return { ok: results.every(result => result.status !== 'failed'), results }; }

export async function run() {
  const mainSha = await resolveExactMainPolicyHead();
  const snapshotStartedAt = new Date().toISOString();
  const open = await openPulls('main');
  const snapshotCompletedAt = new Date().toISOString();
  const linearSnapshot = await linearActiveIssueSnapshot();
  const linearIssues = linearSnapshot.issues;
  const audit = buildPrFleetClosureAudit({
    repository: repo,
    pullRequests: open,
    linearIssues,
    prPacketMap: prPacketMap(linearIssues),
    symphonyState: await fetchOfficialSymphonyState(),
    snapshot: {
      complete: true,
      startedAt: snapshotStartedAt,
      completedAt: snapshotCompletedAt,
      linear: linearSnapshot.coverage,
    },
    now: new Date(snapshotCompletedAt),
  });
  console.log(renderPrFleetClosureAudit(audit));
  if (audit.status !== 'healthy') {
    const remediation = await processFleetClosureRemediationIntents(audit);
    console.log(
      JSON.stringify({
        schema: 'jovie-pr-fleet-remediation-run/v1',
        ...remediation,
      })
    );
    console.error(
      `Ownerless recovery sweep blocked by PR fleet closure audit: ${audit.violations
        .map(violation => violation.reason)
        .join(', ')}`
    );
    process.exitCode = 1;
    return;
  }
  const openHeadShas = await openStackHeadShas(mainSha);
  let dispatched = 0;
  let alreadyQueued = 0;
  let failed = 0;
  for (const summary of open) {
    try {
      const evidence = await candidateEvidence(summary, mainSha, openHeadShas);
      const preliminary = evaluateRecoveryCandidate({
        ...evidence,
        mainSha,
        checksPassing: true,
      });
      if (!preliminary.eligible) {
        console.log(`#${summary.number} skipped: ${preliminary.reason}`);
        continue;
      }
      const decision = (await checksAreGreen(summary.number))
        ? preliminary
        : { eligible: false, reason: 'focused-checks-not-green' };
      if (!decision.eligible) {
        console.log(`#${summary.number} skipped: ${decision.reason}`);
        continue;
      }
      const result = await dispatchRecoveryIntent(
        summary,
        mainSha,
        evidence,
        decision
      );
      if (result.queued) alreadyQueued += 1;
      else if (result.pending) dispatched += 1;
      else if (countsAsRecoveryFailure(result)) failed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `#${summary.number} recovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  console.log(
    `Ownerless recovery sweep complete: dispatched=${dispatched} alreadyQueued=${alreadyQueued} failed=${failed} dryRun=${dryRun}`
  );
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  run().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
