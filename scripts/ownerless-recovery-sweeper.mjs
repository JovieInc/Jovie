#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  evaluateRecoveryCandidate,
  renderRecoveryReceipt,
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
  try {
    return classifyQueueCheckBlockers(await ghJson(args)).length === 0;
  } catch (error) {
    const stdout = error?.stdout?.trim();
    if (!stdout) return false;
    try {
      return classifyQueueCheckBlockers(JSON.parse(stdout)).length === 0;
    } catch {
      return false;
    }
  }
}

async function readQueueProof(number) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state mergedAt mergeCommit{oid} mergeQueueEntry{position state}}}}`;
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

async function candidateEvidence(summary, mainSha) {
  const number = summary.number;
  const pr = await ghJson(['api', `repos/${repo}/pulls/${number}`]);
  const timeline = await pages(
    `repos/${repo}/issues/${number}/timeline?per_page=100`
  );
  const changed = await pages(
    `repos/${repo}/pulls/${number}/files?per_page=100`
  );
  const files = changed.map(file => file.filename);
  const patch = changed.map(file => file.patch ?? '').join('\n');
  const compare = await ghJson([
    'api',
    `repos/${repo}/compare/${mainSha}...${pr.head.sha}`,
  ]);
  return { pr, timeline, files, patch, compare };
}

async function promote(summary, mainSha, evidence, decision) {
  const number = summary.number;
  const expectedHead = evidence.pr.head.sha;
  if (dryRun) {
    console.log(`[dry-run] #${number} eligible: ${decision.lanes.join(',')}`);
    return { queued: false, dryRun: true };
  }

  const liveMain = await gh([
    'api',
    `repos/${repo}/git/ref/heads/main`,
    '--jq',
    '.object.sha',
  ]);
  const live = await ghJson(['api', `repos/${repo}/pulls/${number}`]);
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

  if (live.draft) await gh(['pr', 'ready', String(number), '-R', repo]);
  if ((live.labels ?? []).some(label => label.name === 'queue-deferred')) {
    await gh([
      'pr',
      'edit',
      String(number),
      '-R',
      repo,
      '--remove-label',
      'queue-deferred',
    ]);
  }
  try {
    await gh([
      'pr',
      'merge',
      String(number),
      '-R',
      repo,
      '--auto',
      '--squash',
      '--match-head-commit',
      expectedHead,
    ]);
  } catch (error) {
    await upsertReceipt(
      number,
      renderRecoveryReceipt({
        pr: number,
        head: expectedHead,
        main: mainSha,
        ownerlessSince: liveDecision.ownerlessSince,
        lanes: liveDecision.lanes,
        action: 'gh-pr-merge-auto-squash',
        outcome: 'merge-request-failed',
        observedAt: new Date().toISOString(),
      })
    );
    throw error;
  }

  let proof = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    proof = await readQueueProof(number);
    if (proof?.state === 'MERGED' || proof?.mergeQueueEntry) break;
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  const outcome =
    proof?.state === 'MERGED'
      ? 'merged'
      : proof?.mergeQueueEntry
        ? 'queued'
        : 'requested-unproven';
  await upsertReceipt(
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
      observedAt: new Date().toISOString(),
    })
  );
  console.log(`#${number} recovery action: ${outcome}`);
  return { queued: outcome === 'queued' || outcome === 'merged' };
}

export async function run() {
  const mainSha = await gh([
    'api',
    `repos/${repo}/git/ref/heads/main`,
    '--jq',
    '.object.sha',
  ]);
  const open = await pages(
    `repos/${repo}/pulls?state=open&base=main&per_page=100`
  );
  let promoted = 0;
  let unproven = 0;
  for (const summary of open) {
    try {
      const evidence = await candidateEvidence(summary, mainSha);
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
