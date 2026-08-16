#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  evaluateRecoveryCandidate,
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

const openPulls = () =>
  pages(`repos/${repo}/pulls?state=open&base=main&per_page=100`);

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

async function readQueueProof(number) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state headRefOid isInMergeQueue mergedAt mergeCommit{oid} mergeQueueEntry{id position state}}}}`;
  const data = await ghJson([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${number}`,
  ]);
  return data?.data?.repository?.pullRequest ?? null;
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
  const patchComplete = changed.every(file => typeof file.patch === 'string');
  const patch = changed
    .filter(file => typeof file.patch === 'string')
    .map(file => file.patch)
    .join('\n');
  const commits = await pages(
    `repos/${repo}/pulls/${number}/commits?per_page=100`
  );
  const commitShas = new Set(commits.map(commit => commit.sha));
  const containsOpenPrHead = openHeadShas.some(
    candidateHead =>
      candidateHead !== pr.head.sha && commitShas.has(candidateHead)
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
    if (
      restoreDeferred &&
      !(current?.labels ?? []).some(label => label.name === 'queue-deferred')
    ) {
      await prCommand('edit', number, '--add-label', 'queue-deferred').catch(
        () => failures.push('queue-deferred-restore')
      );
    }
    if (restoreDraft && current?.draft === false) {
      await prCommand('ready', number, '--undo').catch(() =>
        failures.push('draft-restore')
      );
    }
    return failures;
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
      (await openPulls()).map(pr => pr.head.sha)
    );
    const postMutationMain = await mainHead();
    const postMutationDecision = evaluateRecoveryCandidate({
      ...postMutationEvidence,
      mainSha: postMutationMain,
      checksPassing: await checksAreGreen(number),
    });
    if (
      postMutationMain !== mainSha ||
      postMutationEvidence.pr.head.sha !== expectedHead ||
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
    const autoDisabled = await prCommand(
      'merge',
      number,
      '--disable-auto'
    ).then(
      () => true,
      () => false
    );
    if (!autoDisabled) {
      await writeReceipt('requested-unproven-disable-failed', proof);
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
  const open = await openPulls();
  const openHeadShas = open.map(pr => pr.head.sha);
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
      else if (!result.dryRun) unproven += 1;
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
