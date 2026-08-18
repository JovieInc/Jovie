#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  evaluateRecoveryCandidate,
  hasCompletePatch,
  renderRecoveryReceipt,
} from './lib/ownerless-recovery-policy.mjs';
import { classifyQueueCheckBlockers } from './lib/pr-check-failures.mjs';
import { readPullRequestQueueState } from './merge-queue-backend.mjs';

const execFileAsync = promisify(execFile);
const repo =
  process.env.REPO || process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const dryRun = /^(1|true)$/i.test(process.env.DRY_RUN || 'false');
const EXACT_SHA = /^[0-9a-f]{40}$/;

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

export async function dispatchRecoveryIntent(
  summary,
  mainSha,
  evidence,
  decision,
  dependencies = {}
) {
  const {
    apiJsonImpl = apiJson,
    candidateEvidenceImpl = candidateEvidence,
    checksAreGreenImpl = checksAreGreen,
    dispatchExactAdmissionImpl = dispatchExactAdmission,
    evaluateRecoveryCandidateImpl = evaluateRecoveryCandidate,
    mainHeadImpl = mainHead,
    nowImpl = () => new Date().toISOString(),
    openStackHeadShasImpl = openStackHeadShas,
    pagesImpl = pages,
    prCommandImpl = prCommand,
    readPullRequestQueueStateImpl = readPullRequestQueueState,
    upsertReceiptImpl = upsertReceipt,
  } = dependencies;
  const number = summary.number;
  const expectedHead = evidence.pr.head.sha;
  if (dryRun) {
    console.log(`[dry-run] #${number} eligible: ${decision.lanes.join(',')}`);
    return { queued: false, dryRun: true };
  }

  const liveMain = await mainHeadImpl();
  const live = await apiJsonImpl(`repos/${repo}/pulls/${number}`);
  const liveTimeline = await pagesImpl(
    `repos/${repo}/issues/${number}/timeline?per_page=100`
  );
  const liveDecision = evaluateRecoveryCandidateImpl({
    ...evidence,
    pr: live,
    timeline: liveTimeline,
    mainSha: liveMain,
    checksPassing: await checksAreGreenImpl(number),
  });
  if (
    liveMain !== mainSha ||
    live.head.sha !== expectedHead ||
    !liveDecision.eligible
  ) {
    console.log(`#${number} changed before mutation; skipped`);
    return { queued: false };
  }

  const writeReceipt = outcome =>
    upsertReceiptImpl(
      number,
      renderRecoveryReceipt({
        pr: number,
        head: expectedHead,
        main: mainSha,
        ownerlessSince: liveDecision.ownerlessSince,
        lanes: liveDecision.lanes,
        action: 'dispatch-to-merge-queue-autoenroll',
        outcome,
        observedAt: nowImpl(),
      }),
      `${expectedHead}-${outcome}`
    );

  let queueOwnership;
  try {
    queueOwnership = classifyQueueOwnership(
      await readPullRequestQueueStateImpl({
        backend: 'native',
        repository: repo,
        number,
      }),
      expectedHead
    );
  } catch (error) {
    await writeReceipt('queue-ownership-read-failed');
    throw error;
  }
  if (queueOwnership.action === 'no_dispatch') {
    await writeReceipt(queueOwnership.outcome);
    console.log(`#${number} exact head is already in the native queue`);
    return { queued: true, pending: false };
  }
  if (queueOwnership.action === 'fail') {
    await writeReceipt(queueOwnership.outcome);
    return { queued: false, pending: false };
  }

  await writeReceipt('attempting');

  const restoreDraft = live.draft;
  const compensate = async () => {
    const failures = [];
    const current = await apiJsonImpl(`repos/${repo}/pulls/${number}`).catch(
      () => null
    );
    if (!current) failures.push('state-read');
    if (restoreDraft && current?.draft !== true) {
      await prCommandImpl('ready', number, '--undo').catch(() =>
        failures.push('draft-restore')
      );
    }
    return failures;
  };

  try {
    if (live.draft) {
      await prCommandImpl('ready', number);
    }

    const postMutationEvidence = await candidateEvidenceImpl(
      summary,
      mainSha,
      await openStackHeadShasImpl(mainSha)
    );
    const postMutationChecksPassing =
      restoreDraft || (await checksAreGreenImpl(number));
    const [postMutationMain, postMutationPr] = await Promise.all([
      mainHeadImpl(),
      apiJsonImpl(`repos/${repo}/pulls/${number}`),
    ]);
    const postMutationDecision = evaluateRecoveryCandidateImpl({
      ...postMutationEvidence,
      pr: postMutationPr,
      mainSha: postMutationMain,
      checksPassing: true,
    });
    if (
      postMutationMain !== mainSha ||
      postMutationPr.head.sha !== expectedHead ||
      !postMutationDecision.eligible
    ) {
      const failures = await compensate();
      await writeReceipt(
        failures.length === 0
          ? 'promotion-compensated'
          : `promotion-compensation-failed:${failures.join(',')}`
      );
      return { queued: false };
    }
    if (restoreDraft) {
      await writeReceipt('promoted-awaiting-checks');
      return { queued: false, pending: true };
    }
    if (!postMutationChecksPassing) {
      const failures = await compensate();
      await writeReceipt(
        failures.length === 0
          ? 'checks-changed-compensated'
          : `checks-changed-compensation-failed:${failures.join(',')}`
      );
      return { queued: false };
    }

    await dispatchExactAdmissionImpl(
      number,
      expectedHead,
      mainSha,
      liveDecision.ownerlessSince
    );
  } catch (error) {
    const failures = await compensate();
    await writeReceipt(
      failures.length === 0
        ? 'dispatch-failed-compensated'
        : `dispatch-failed-compensation-failed:${failures.join(',')}`
    );
    throw error;
  }
  await writeReceipt('delegated-exact-head-admission');
  console.log(
    `#${number} recovery action: delegated exact head to Merge Queue Auto-Enroll`
  );
  return { queued: false, pending: true };
}

export async function run() {
  const mainSha = await resolveExactMainPolicyHead();
  const open = await openPulls('main');
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
      const checksPassing = await checksAreGreen(summary.number);
      const decision = checksPassing
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
      else if (!result.dryRun) failed += 1;
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
