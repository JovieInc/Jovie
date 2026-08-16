#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  evaluateRecoveryCandidate,
  hasCompletePatch,
  renderRecoveryReceipt,
  validateRecoveryMergeProof,
} from './lib/ownerless-recovery-policy.mjs';
import { classifyQueueCheckBlockers } from './lib/pr-check-failures.mjs';

const execFileAsync = promisify(execFile);
const repo =
  process.env.REPO || process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const dryRun = /^(1|true)$/i.test(process.env.DRY_RUN || 'false');

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

async function readQueueProof(number) {
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state headRefOid isInMergeQueue autoMergeRequest{enabledAt} mergedAt mergeCommit{oid} mergeQueueEntry{id position state}}}}`;
  return (await repoGraph(query, { number }))?.pullRequest ?? null;
}

async function openStackHeadShas() {
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
  return pulls.nodes.flatMap(pr =>
    [
      pr.headRefOid,
      ...pr.commits.nodes.map(node => node.commit.oid),
      ...pr.timelineItems.nodes.flatMap(event => [
        event.beforeCommit?.oid,
        event.afterCommit?.oid,
      ]),
    ]
      .filter(Boolean)
      .map(sha => ({ number: pr.number, sha }))
  );
}

async function upsertReceipt(number, body) {
  await execFileAsync(
    'bash',
    [
      'scripts/lib/upsert-pr-comment.sh',
      String(number),
      'ownerless-recovery',
      body,
    ],
    {
      env: { ...process.env, GITHUB_REPOSITORY: repo },
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

async function promote(summary, mainSha, evidence, decision) {
  const number = summary.number;
  const expectedHead = evidence.pr.head.sha;
  if (dryRun) {
    console.log(`[dry-run] #${number} eligible: ${decision.lanes.join(',')}`);
    return { queued: false, dryRun: true };
  }

  const liveMain = await mainHead();
  const live = await apiJson(`repos/${repo}/pulls/${number}`);
  const liveTimeline = await pages(
    `repos/${repo}/issues/${number}/timeline?per_page=100`
  );
  const liveDecision = evaluateRecoveryCandidate({
    ...evidence,
    pr: live,
    timeline: liveTimeline,
    mainSha: liveMain,
    checksPassing: await checksAreGreen(number),
  });
  if (
    liveMain !== mainSha ||
    live.head.sha !== expectedHead ||
    !liveDecision.eligible
  ) {
    console.log(`#${number} changed before mutation; skipped`);
    return { queued: false };
  }

  const writeReceipt = (outcome, proof = null) =>
    upsertReceipt(
      number,
      renderRecoveryReceipt({
        pr: number,
        head: expectedHead,
        main: mainSha,
        ownerlessSince: liveDecision.ownerlessSince,
        lanes: liveDecision.lanes,
        action: 'gh-pr-merge-auto-squash',
        outcome,
        mergeQueueState: proof?.mergeQueueEntry?.state,
        mergeQueuePosition: proof?.mergeQueueEntry?.position,
        mergeQueueEntryId: proof?.mergeQueueEntry?.id,
        observedAt: new Date().toISOString(),
      })
    );

  await writeReceipt('attempting');

  const restoreDraft = live.draft;
  const restoreDeferred = (live.labels ?? []).some(
    label => label.name === 'queue-deferred'
  );
  const compensate = async () => {
    const failures = [];
    const current = await apiJson(`repos/${repo}/pulls/${number}`).catch(
      () => null
    );
    if (!current) failures.push('state-read');
    if (
      restoreDeferred &&
      (!current ||
        !current.labels.some(label => label.name === 'queue-deferred'))
    ) {
      await prCommand('edit', number, '--add-label', 'queue-deferred').catch(
        () => failures.push('queue-deferred-restore')
      );
    }
    if (restoreDraft && current?.draft !== true) {
      await prCommand('ready', number, '--undo').catch(() =>
        failures.push('draft-restore')
      );
    }
    return failures;
  };
  const disableAuto = async () => {
    await prCommand('merge', number, '--disable-auto').catch(() => null);
    const proof = await readQueueProof(number).catch(() => null);
    const safe =
      proof?.state === 'OPEN' &&
      proof.headRefOid === expectedHead &&
      proof.autoMergeRequest == null &&
      proof.isInMergeQueue === false;
    return { proof, safe };
  };

  try {
    if (live.draft) {
      await prCommand('ready', number);
    }
    if (restoreDeferred) {
      await prCommand('edit', number, '--remove-label', 'queue-deferred');
    }

    const postMutationEvidence = await candidateEvidence(
      summary,
      mainSha,
      await openStackHeadShas()
    );
    const postMutationChecksPassing =
      restoreDraft || (await checksAreGreen(number));
    const [postMutationMain, postMutationPr] = await Promise.all([
      mainHead(),
      apiJson(`repos/${repo}/pulls/${number}`),
    ]);
    const postMutationDecision = evaluateRecoveryCandidate({
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

    await prCommand(
      'merge',
      number,
      '--auto',
      '--squash',
      '--match-head-commit',
      expectedHead
    );
  } catch (error) {
    const racedProof = await readQueueProof(number).catch(() => null);
    const raced = validateRecoveryMergeProof(racedProof, expectedHead);
    if (raced.proven) {
      await writeReceipt(raced.outcome, racedProof);
      console.log(
        `#${number} recovery action: ${raced.outcome} (concurrent controller)`
      );
      return { queued: true };
    }
    const disabled = await disableAuto();
    const concurrent = validateRecoveryMergeProof(disabled.proof, expectedHead);
    if (concurrent.proven) {
      await writeReceipt(concurrent.outcome, disabled.proof);
      return { queued: true };
    }
    if (!disabled.safe) {
      await writeReceipt(
        'merge-request-unproven-disable-failed',
        disabled.proof
      );
      return { queued: false };
    }
    const failures = await compensate();
    await writeReceipt(
      failures.length === 0
        ? 'merge-request-failed-compensated'
        : `merge-request-compensation-failed:${failures.join(',')}`
    );
    throw error;
  }

  let proof = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    proof = await readQueueProof(number);
    if (validateRecoveryMergeProof(proof, expectedHead).proven) break;
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  const verified = validateRecoveryMergeProof(proof, expectedHead);
  if (!verified.proven) {
    const disabled = await disableAuto();
    const concurrent = validateRecoveryMergeProof(disabled.proof, expectedHead);
    if (concurrent.proven) {
      await writeReceipt(concurrent.outcome, disabled.proof);
      return { queued: true };
    }
    if (!disabled.safe) {
      await writeReceipt('requested-unproven-disable-failed', disabled.proof);
      console.log(
        `#${number} recovery action: requested-unproven-disable-failed`
      );
      return { queued: false };
    }
    const failures = await compensate();
    const outcome =
      failures.length === 0
        ? 'requested-unproven-compensated'
        : `requested-unproven-compensation-failed:${failures.join(',')}`;
    await writeReceipt(outcome, proof);
    console.log(`#${number} recovery action: ${outcome}`);
    return { queued: false };
  }
  await writeReceipt(verified.outcome, proof);
  console.log(`#${number} recovery action: ${verified.outcome}`);
  return { queued: true };
}

export async function run() {
  const mainSha = await mainHead();
  const open = await openPulls('main');
  const openHeadShas = await openStackHeadShas();
  let promoted = 0;
  let unproven = 0;
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
      const result = await promote(summary, mainSha, evidence, decision);
      if (result.queued) promoted += 1;
      else if (!result.dryRun && !result.pending) unproven += 1;
    } catch (error) {
      unproven += 1;
      console.error(
        `#${summary.number} recovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  console.log(
    `Ownerless recovery sweep complete: promoted=${promoted} unproven=${unproven} dryRun=${dryRun}`
  );
  if (unproven > 0) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  run().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
