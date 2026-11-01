#!/usr/bin/env node
// Main-red ejection driver. A failing check must never stop the queue:
// attribute the culprit, revert it through the compounding jump path, re-land it
// as a repair PR, and free a conflicted queue head. See scripts/lib/main-red-eject.mjs.
//
//   node scripts/main-red-eject.mjs plan                 read-only; prints the decision (dry run)
//   node scripts/main-red-eject.mjs apply                 plan, then revert + enqueue + incident
//   node scripts/main-red-eject.mjs reopen --pr <revert>  after the revert merged: re-land as a repair PR
//   node scripts/main-red-eject.mjs stuck-head [--apply]  UNMERGEABLE head > 5 min: dequeue, conflict pass
//
// Mode: MAIN_RED_EJECT_MODE = off | dry | apply (default apply). Kill switch is `off`.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runGh } from '../packages/api-client/gh.ts';
import {
  attributeCulprit,
  bisectFirstRed,
  COMPOUNDING_LABEL,
  CONFLICT_LABEL,
  checkKey,
  classifyEvidence,
  decideEject,
  decideFailingHead,
  detectConsecutiveGroupFailure,
  detectStuckHead,
  FIX_RED_LABEL,
  failingHeadComment,
  failingRequiredChecks,
  failureSignature,
  HEAD_STUCK_ALERT_MIN,
  headDwell,
  INCIDENT_LABEL,
  INCIDENT_SCHEMA,
  MAX_LOOKBACK_COMMITS,
  marker,
  parsePrNumber,
  planJump,
  REOPEN_LABEL,
  REVERT_LABEL,
  readMarker,
  shouldFailOver,
  titles,
  verifyJump,
} from './lib/main-red-eject.mjs';

const REPO = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const CI_WORKFLOW = 'ci.yml';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {string[]} args
 * @param {import('../packages/api-client/contract.ts').PriorityName} priority
 */
async function gh(args, priority = 'repair') {
  let r = await runGh(args, { priority });
  // The Jovie Bot installation shares one hourly budget with every other workflow
  // (2026-10-31: exhausted for 5 h, queue head stuck). Fail over to the job's own
  // GITHUB_TOKEN bucket instead of dying; the ledger keys buckets by credential.
  if (r.code !== 0 && shouldFailOver(r, process.env.GH_FALLBACK_TOKEN)) {
    console.error(
      '::warning::github-app-quota-failover: Jovie Bot installation exhausted; retrying with GITHUB_TOKEN.'
    );
    r = await runGh(args, {
      priority,
      env: { ...process.env, GH_TOKEN: process.env.GH_FALLBACK_TOKEN },
    });
  }
  if (r.code !== 0)
    throw new Error(
      `gh ${args.slice(0, 3).join(' ')}: ${r.stderr.trim().slice(0, 300)}`
    );
  return r.stdout;
}
const api = async (path, priority) =>
  JSON.parse(await gh(['api', path], priority));

// ---- evidence --------------------------------------------------------------

async function signatureOfRun(run) {
  const { jobs } = await api(
    `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`,
    'poll'
  );
  const failed = jobs.filter(
    j => j.conclusion === 'failure' && /^ci-fast \(/.test(j.name)
  );
  const logs = [];
  for (const job of failed.slice(0, 3))
    logs.push(
      await gh(
        ['api', `repos/${REPO}/actions/jobs/${job.id}/logs`],
        'poll'
      ).catch(() => '')
    );
  return failureSignature(logs);
}

/** @typedef {{id:number, conclusion:string, createdAt:string, sha:string, branch:string, signature?:string[]}} MergeGroupRun */

/** @returns {Promise<MergeGroupRun[]>} */
async function mergeGroupRuns(pages = 1) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const { workflow_runs } = await api(
      `repos/${REPO}/actions/workflows/${CI_WORKFLOW}/runs?event=merge_group&status=completed&per_page=100&page=${page}`,
      'poll'
    );
    rows.push(...workflow_runs);
  }
  return rows.map(r => ({
    id: r.id,
    conclusion: r.conclusion,
    createdAt: r.created_at,
    sha: r.head_sha,
    branch: r.head_branch,
  }));
}

/**
 * A main commit older than the listing window: ask for its own merge-group run directly.
 * @param {string} sha
 * @returns {Promise<MergeGroupRun | undefined>}
 */
async function runForSha(sha) {
  const { workflow_runs } = await api(
    `repos/${REPO}/actions/workflows/${CI_WORKFLOW}/runs?event=merge_group&head_sha=${sha}&per_page=5`,
    'poll'
  ).catch(() => ({ workflow_runs: [] }));
  const r = workflow_runs.find(
    x => x.status === 'completed' && x.conclusion !== 'cancelled'
  );
  return r
    ? {
        id: r.id,
        conclusion: r.conclusion,
        createdAt: r.created_at,
        sha,
        branch: r.head_branch,
      }
    : undefined;
}

async function mainCommits() {
  const rows = await api(
    `repos/${REPO}/commits?sha=main&per_page=${MAX_LOOKBACK_COMMITS}`,
    'poll'
  );
  return rows
    .map(c => ({
      sha: c.sha,
      subject: c.commit.message.split('\n')[0],
      pr: parsePrNumber(c.commit.message),
      at: c.commit.committer.date,
      author: c.author?.login ?? null,
    }))
    .reverse(); // oldest first
}

// ---- plan ------------------------------------------------------------------

export async function plan({
  mode = process.env.MAIN_RED_EJECT_MODE || 'apply',
  now = Date.now(),
} = {}) {
  const runs = await mergeGroupRuns(4); // ~400 runs covers the lookback; per-sha lookups only for stragglers
  // Cheap gate: signatures cost log downloads, so only look when two consecutive groups failed.
  const recent = runs
    .filter(r => !['cancelled', 'skipped'].includes(r.conclusion))
    .slice(0, 8);
  const failedRecent = recent.filter(r => r.conclusion === 'failure');
  const result = {
    schema: INCIDENT_SCHEMA,
    mode,
    at: new Date(now).toISOString(),
    trigger: null,
  };
  const consecutive = recent.slice(0, 2).every(r => r.conclusion === 'failure');
  if (failedRecent.length < 2 || !(consecutive || failedRecent.length >= 3))
    return {
      ...result,
      action: 'none',
      reason: 'fewer-than-2-consecutive-failed-groups',
    };

  for (const run of failedRecent.slice(0, 6))
    run.signature = await signatureOfRun(run);
  const trigger = detectConsecutiveGroupFailure(
    recent.map(r => ({ ...r, signature: r.signature }))
  );
  if (!trigger.triggered)
    return {
      ...result,
      action: 'none',
      reason: 'failures-do-not-share-a-signature',
    };
  const check = checkKey(trigger.signature);

  const commits = await mainCommits();
  const bySha = new Map(runs.map(r => [r.sha, r]));
  const evidence = [];
  for (const c of commits) {
    const run = bySha.get(c.sha) ?? (await runForSha(c.sha));
    if (run && run.conclusion === 'failure' && !run.signature)
      run.signature = await signatureOfRun(run);
    evidence.push({
      ...c,
      evidence: classifyEvidence(run, trigger.signature),
      run: run?.id ?? null,
    });
  }
  let attribution = attributeCulprit(evidence);
  if (attribution.status === 'ambiguous') {
    const probeCmd = process.env.MAIN_RED_PROBE_CMD || PROBES[check];
    const probe = probeCmd ? commandProbe(probeCmd) : null;
    if (probe) {
      const { culprit, probes } = await bisectFirstRed(
        attribution.candidates,
        probe
      );
      attribution = {
        ...attribution,
        culprit,
        bisect: probes,
        status: 'bisected',
      };
    }
  }
  const culprit = attribution.culprit;

  const open = await api(`repos/${REPO}/pulls?state=open&per_page=100`, 'poll');
  const openReverts = open
    .filter(p => p.labels.some(l => l.name === REVERT_LABEL))
    .map(p => ({ number: p.number, check: readMarker(p.body)?.check }));
  const repairs = open
    .filter(
      p =>
        p.labels.some(l => l.name === COMPOUNDING_LABEL) &&
        /main (is )?red|recert|renew|census/i.test(p.title)
    )
    .map(p => ({
      number: p.number,
      createdAt: p.created_at,
      queued: Boolean(p.auto_merge),
    }));
  const prior = culprit?.pr
    ? await api(`repos/${REPO}/issues/${culprit.pr}`, 'poll').catch(() => null)
    : null;
  const priorAttempts = prior ? (readMarker(prior.body)?.attempt ?? 0) : 0;
  const decision = decideEject({
    culprit,
    check,
    openReverts,
    repairs,
    priorAttempts,
    now,
    mode,
    ambiguous: attribution.status === 'ambiguous',
    culpritLabels: (prior?.labels ?? []).map(l => l.name),
  });
  return {
    ...result,
    trigger: { groups: trigger.groups, signature: trigger.signature },
    check,
    attribution: {
      status: attribution.status,
      bisect: attribution.bisect ?? null,
    },
    culprit,
    decision,
    titles: culprit?.pr ? titles(culprit) : null,
    evidence: evidence.map(({ sha, pr, evidence: e, run }) => ({
      sha: sha.slice(0, 8),
      pr,
      evidence: e,
      run,
    })),
    priorAttempts,
  };
}

// Node-only repro commands so a bisect needs no install (same checks Main Health runs).
const PROBES = {
  'gate:Design Conformance': 'node scripts/design-conformance-check.mjs',
  'test:lib/__tests__/design-surface-census.test.mjs':
    'node scripts/design-surface-census.mjs HEAD^',
};

function commandProbe(cmd) {
  return async sha => {
    try {
      execFileSync('git', ['checkout', '-q', '--detach', sha], {
        stdio: 'pipe',
      });
      execFileSync('bash', ['-c', cmd], { stdio: 'pipe' });
      return 'green';
    } catch {
      return 'red';
    }
  };
}

// ---- queue -----------------------------------------------------------------

async function queueEntries() {
  const q = `query($o:String!,$r:String!){repository(owner:$o,name:$r){mergeQueue(branch:"main"){entries(first:50){nodes{position state enqueuedAt headCommit{oid} pullRequest{number labels(first:30){nodes{name}}}}}}}}`;
  const [o, r] = REPO.split('/');
  const out = JSON.parse(
    await gh(
      ['api', 'graphql', '-f', `query=${q}`, '-f', `o=${o}`, '-f', `r=${r}`],
      'merge'
    )
  );
  return (out.data.repository.mergeQueue?.entries.nodes ?? []).map(n => ({
    number: n.pullRequest.number,
    position: n.position,
    sha: n.headCommit?.oid ?? null,
    state: n.state,
    enqueuedAt: n.enqueuedAt,
    compounding: n.pullRequest.labels.nodes.some(
      l => l.name.toLowerCase() === COMPOUNDING_LABEL
    ),
  }));
}

const QUOTA_DEFERRED_CODE = 'dequeue_quota_deferred';

/** A MergeQueueBackendError that is the installation bucket's rate-limit exhaustion. */
function isInstallationQuotaExhaustion(error) {
  return (
    error?.name === 'MergeQueueBackendError' &&
    error?.code === 'gh_command_failed' &&
    shouldFailOver(
      { code: 1, stderr: error.details?.stderr ?? '' },
      process.env.GH_FALLBACK_TOKEN
    )
  );
}

/** Same contract as runGh's exit-75 defer: visible, retryable, not a verdict. */
function quotaDeferredError(cause) {
  const reason =
    cause?.code === 'native_mutation_actor_unauthorized'
      ? `fallback identity ${cause.details?.observedActor ?? 'unknown'} is not a trusted native queue mutation actor (mutation-actor check held)`
      : `fallback token also exhausted: ${String(cause?.details?.stderr ?? cause?.message ?? '').slice(0, 160)}`;
  return Object.assign(new Error(`Queue mutation deferred: ${reason}`), {
    name: 'MergeQueueDeferError',
    code: QUOTA_DEFERRED_CODE,
    details: { cause: cause?.code ?? 'unknown_error' },
  });
}

async function dequeue(number) {
  // Only dequeuePullRequest is imported on the happy path: contract tests mock
  // this module partially (main-red-eject-failing-head.test.mjs provides just
  // dequeuePullRequest), and vitest fails closed on any other export access.
  // createGhRunner is imported lazily inside the failover branch only.
  const { dequeuePullRequest } = await import('./merge-queue-backend.mjs');
  const attempt = runners =>
    dequeuePullRequest({
      backend: 'native',
      repository: REPO,
      number,
      ...runners,
    });
  try {
    return await attempt({});
  } catch (error) {
    // The gh()-wrapper failover above covers this script's own calls only;
    // the backend spawns its own `gh` runners. When the Jovie Bot installation
    // bucket is exhausted, retry the whole backend call (actor verification
    // included) on the fallback credential.
    if (!isInstallationQuotaExhaustion(error)) throw error;
    const fallback = process.env.GH_FALLBACK_TOKEN;
    if (!fallback || fallback === process.env.GH_TOKEN) throw error;
    console.error(
      '::warning::github-app-quota-failover: Jovie Bot installation exhausted for the queue mutation; retrying actor verification with GITHUB_TOKEN.'
    );
    const { createGhRunner } = await import('./merge-queue-backend.mjs');
    const runner = createGhRunner({
      env: { ...process.env, GH_TOKEN: fallback },
    });
    try {
      return await attempt({ runner, mutationRunner: runner });
    } catch (fallbackError) {
      // A refusal here is the mutation-actor safety check working, not a bug:
      // GITHUB_TOKEN authenticates as github-actions[bot], which is not a
      // trusted queue writer. Defer visibly instead of crashing.
      if (
        fallbackError?.code === 'native_mutation_actor_unauthorized' ||
        isInstallationQuotaExhaustion(fallbackError)
      )
        throw quotaDeferredError(fallbackError);
      throw fallbackError;
    }
  }
}

/** Green Enroll is the only queue writer: dequeue first if already queued, then dispatch it. */
async function enqueueWithJump(number) {
  const before = await queueEntries();
  const step = planJump(before, number);
  if (step.step === 'already-head')
    return { ...step, verified: verifyJump(before, number) };
  if (step.step === 'dequeue-then-enqueue-with-jump') await dequeue(number);
  await gh(
    [
      'workflow',
      'run',
      'merge-queue-green-enroll.yml',
      '-f',
      `pr_number=${number}`,
    ],
    'merge'
  );
  // The position Green Enroll logs is read before the jump reorders the queue: re-read, never trust it.
  let verified = null;
  for (let i = 0; i < 6; i += 1) {
    await sleep(20_000);
    verified = verifyJump(await queueEntries(), number);
    if (verified.queued) break;
  }
  return { ...step, verified };
}

// ---- incident --------------------------------------------------------------

async function incident(key, title, body) {
  const found = await api(
    `repos/${REPO}/issues?state=open&labels=${INCIDENT_LABEL}&per_page=50`,
    'repair'
  );
  const existing = found.find(i => readMarker(i.body)?.key === key);
  const text = `${marker({ key })}\n${body}`;
  if (existing) {
    await gh([
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues/${existing.number}/comments`,
      '-f',
      `body=${body}`,
    ]);
    return existing.number;
  }
  const created = JSON.parse(
    await gh([
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues`,
      '-f',
      `title=${title}`,
      '-f',
      `body=${text}`,
      '-f',
      `labels[]=${INCIDENT_LABEL}`,
      '-f',
      'labels[]=summer',
    ])
  );
  return created.number;
}

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

// ---- apply -----------------------------------------------------------------

export async function apply(p) {
  if (!p.decision) return { ...p, applied: false };
  const { culprit, check, decision } = p;
  if (decision.action !== 'revert') {
    if (
      decision.action === 'alert' ||
      decision.action === 'skip' ||
      decision.action === 'dry-revert'
    )
      if (decision.action === 'alert')
        await incident(
          `alert:${check}`,
          `main-red: ${check} (manual: ${decision.reason})`,
          `Main is red on \`${check}\`. Automatic revert not taken: ${decision.reason}. Culprit candidate: ${culprit ? `#${culprit.pr} ${culprit.sha}` : 'unknown'}.`
        );
    return { ...p, applied: false };
  }
  const t = p.titles;
  const branch = `compounding/revert-${culprit.pr}-${culprit.sha.slice(0, 7)}`;
  git('fetch', '--no-tags', 'origin', 'main');
  git('switch', '-C', branch, 'origin/main');
  try {
    git('revert', '--no-edit', culprit.sha);
  } catch (error) {
    try {
      git('revert', '--abort');
    } catch {
      /* nothing to abort */
    }
    await incident(
      `alert:${check}`,
      `main-red: ${check} (revert conflicts)`,
      `Auto-revert of #${culprit.pr} (${culprit.sha}) conflicts with main: ${String(error.message).slice(0, 200)}. Needs a lane.`
    );
    return { ...p, applied: false, reason: 'revert-conflict' };
  }
  git(
    'commit',
    '--amend',
    '-m',
    `${t.revert}\n\nReverts ${culprit.sha}. Ejected by main-red-eject: ${check} failed on ${p.trigger.groups.length} consecutive merge groups.`
  );
  git('push', '--force-with-lease', 'origin', branch);
  const body = [
    marker({
      check,
      culprit: culprit.sha,
      origin: culprit.pr,
      attempt: p.priorAttempts + 1,
    }),
    `## Summary\n\nno Linear issue: main is red (auto-eject). #${culprit.pr} (${culprit.sha}) first made \`${check}\` fail; ${p.trigger.groups.length} consecutive merge groups failed on it, so every PR behind it stalled.`,
    `## Failure attached\n\nSignature: \`${p.trigger.signature.join('`, `')}\`\nMerge-group runs: ${p.trigger.groups.map(id => `https://github.com/${REPO}/actions/runs/${id}`).join(', ')}`,
    '## Next\n\nThis revert jumps the queue (`compounding`). When it merges, #' +
      culprit.pr +
      ' is re-landed as a repair PR with this failure attached.',
    '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  ].join('\n\n');
  const pr = JSON.parse(
    await gh(
      [
        'api',
        '-X',
        'POST',
        `repos/${REPO}/pulls`,
        '-f',
        `title=${t.revert}`,
        '-f',
        `head=${branch}`,
        '-f',
        'base=main',
        '-f',
        `body=${body}`,
      ],
      'merge'
    )
  );
  await gh(
    [
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues/${pr.number}/labels`,
      '-f',
      `labels[]=${COMPOUNDING_LABEL}`,
      '-f',
      `labels[]=${REVERT_LABEL}`,
    ],
    'merge'
  );
  const jump = await enqueueWithJump(pr.number).catch(error => ({
    error: error.message,
  }));
  const issue = await incident(
    `check:${check}`,
    `main-red: ${check}`,
    `Main red on \`${check}\` since ${culprit.at} (#${culprit.pr}). Revert PR #${pr.number}; jump: ${JSON.stringify('verified' in jump ? (jump.verified ?? jump) : jump)}.`
  );
  return { ...p, applied: true, revertPr: pr.number, jump, incident: issue };
}

// ---- reopen ----------------------------------------------------------------

export async function reopen(revertPr) {
  const pr = await api(`repos/${REPO}/pulls/${revertPr}`, 'repair');
  const m = readMarker(pr.body);
  if (!pr.merged_at || !m)
    return { reopened: false, reason: 'not-a-merged-main-red-revert' };
  const origin = await api(`repos/${REPO}/pulls/${m.origin}`, 'repair');
  const branch = `lane-fix/reland-${m.origin}-attempt-${m.attempt}`;
  git('fetch', '--no-tags', 'origin', 'main');
  git('switch', '-C', branch, 'origin/main');
  git('revert', '--no-edit', pr.merge_commit_sha); // re-applies the original change on top of the revert
  const title = titles({ subject: origin.title, pr: m.origin }).reopen;
  git(
    'commit',
    '--amend',
    '-m',
    `${title}\n\nRe-lands #${m.origin} after main-red-eject reverted it (${m.check}).`
  );
  git('push', '--force-with-lease', 'origin', branch);
  const body = [
    marker({
      check: m.check,
      origin: m.origin,
      attempt: m.attempt,
      reverted: pr.number,
    }),
    `## Summary\n\nno Linear issue: re-land of #${m.origin} (${origin.title}), ejected from main because \`${m.check}\` failed. Original author: @${origin.user.login}.`,
    `## Failure to fix\n\nSee #${pr.number} for the failing runs and signature. Fix \`${m.check}\` on this branch (usually: renew certification evidence or rebase onto the changed owner files), then it retries through the normal queue.`,
    '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  ].join('\n\n');
  const created = JSON.parse(
    await gh([
      'api',
      '-X',
      'POST',
      `repos/${REPO}/pulls`,
      '-f',
      `title=${title}`,
      '-f',
      `head=${branch}`,
      '-f',
      'base=main',
      '-f',
      `body=${body}`,
    ])
  );
  await gh([
    'api',
    '-X',
    'POST',
    `repos/${REPO}/issues/${created.number}/labels`,
    '-f',
    `labels[]=${FIX_RED_LABEL}`,
    '-f',
    `labels[]=${REOPEN_LABEL}`,
  ]);
  return { reopened: true, pr: created.number };
}

// ---- failing head ----------------------------------------------------------

async function mainCiGreen() {
  const { workflow_runs } = await api(
    `repos/${REPO}/actions/workflows/${CI_WORKFLOW}/runs?branch=main&event=push&per_page=1`,
    'poll'
  );
  const latest = workflow_runs[0];
  return latest?.status === 'completed' && latest.conclusion === 'success';
}

/** Dequeue a head whose merge group has a failed required check while main CI is green. */
async function failingHead(head, doApply) {
  if (!head.sha) return { failingHead: false };
  const runs = [];
  for (let page = 1; page <= 3; page += 1) {
    const out = await api(
      `repos/${REPO}/commits/${head.sha}/check-runs?per_page=100&page=${page}`,
      'poll'
    );
    runs.push(...out.check_runs);
    if (out.check_runs.length < 100) break;
  }
  const failing = failingRequiredChecks(runs);
  if (!failing.length) return { failingHead: false };
  const decision = decideFailingHead({
    head: { ...head, position: 1 },
    failing,
    mainGreen: await mainCiGreen(),
  });
  if (!decision.dequeue || !doApply) return { failingHead: true, ...decision };
  await dequeue(head.number);
  // The dequeue is the fix; a failed comment must not undo or retry it.
  await gh([
    'api',
    '-X',
    'POST',
    `repos/${REPO}/issues/${head.number}/comments`,
    '-f',
    `body=${failingHeadComment(head, failing)}`,
  ]).catch(error =>
    console.error(`::warning::failing-head comment failed: ${error.message}`)
  );
  return { failingHead: true, ...decision, dequeued: true };
}

// ---- stuck head ------------------------------------------------------------

export async function stuckHead({ doApply = false, now = Date.now() } = {}) {
  const entries = await queueEntries();
  const head = entries.find(e => e.position === 1);
  if (!head) return { stuck: false };
  // Stage metric (stable id = head PR): how long the queue head has sat at position 1.
  const metric = headDwell(entries, now);
  console.log(`stage-metric ${JSON.stringify(metric)}`);
  if (doApply && metric.stuckMin > HEAD_STUCK_ALERT_MIN)
    await incident(
      `queue-head-stuck:${head.number}`,
      `queue head #${head.number} stuck ${metric.stuckMin} min (${head.state})`,
      `Queue head #${head.number} has been at position 1 for ${metric.stuckMin} min in state ${head.state} (alert threshold ${HEAD_STUCK_ALERT_MIN} min). Dequeue it if it is red.`
    );
  // Only an UNMERGEABLE head needs the first-sighting comment read: skip the call otherwise.
  if (head.state !== 'UNMERGEABLE')
    return { stuck: false, metric, ...(await failingHead(head, doApply)) };
  // First sighting is recorded on the PR (durable across runs); GitHub exposes no state-change time.
  const comments = await api(
    `repos/${REPO}/issues/${head.number}/comments?per_page=100`,
    'poll'
  );
  const seenMark = comments
    .map(c => readMarker(c.body))
    .find(m => m?.unmergeableSince);
  const firstSeen = seenMark
    ? { [head.number]: seenMark.unmergeableSince }
    : {};
  const verdict = detectStuckHead(entries, firstSeen, now);
  if (verdict.observe && doApply) {
    await gh([
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues/${head.number}/comments`,
      '-f',
      `body=${marker({ unmergeableSince: new Date(now).toISOString() })}\nQueue head is UNMERGEABLE; dequeuing if it stays so for 5 minutes.`,
    ]);
    return { ...verdict, recorded: true };
  }
  if (!verdict.stuck || !doApply) return verdict;
  let deferReason = null;
  try {
    await dequeue(head.number);
  } catch (error) {
    if (error?.code !== QUOTA_DEFERRED_CODE) throw error;
    deferReason = error.message;
  }
  if (deferReason !== null) {
    // Visible, honest deferred status (run 41227299023 crashed here): the
    // mutation-actor check refused the fallback credential or both credential
    // buckets are exhausted. Nothing was mutated; the next ejector wake
    // retries once quota heals (the first-sighting marker is already on the PR).
    const note = `Queue head #${head.number} is UNMERGEABLE since ${verdict.since} but the dequeue is deferred — ${deferReason}. Nothing was mutated (no labels, no conflict pass, no re-enqueue); the next ejector wake retries.`;
    console.error(`::warning::queue-mutation-deferred: ${note}`);
    await incident(
      `unmergeable:${head.number}`,
      `queue head #${head.number} UNMERGEABLE ${verdict.dwellMin} min (dequeue deferred)`,
      note
    ).catch(error =>
      console.error(
        `::warning::deferred dequeue incident failed: ${error.message}`
      )
    );
    return {
      ...verdict,
      dequeued: false,
      deferred: true,
      reason: deferReason,
    };
  }
  await gh([
    'api',
    '-X',
    'POST',
    `repos/${REPO}/issues/${head.number}/labels`,
    '-f',
    `labels[]=${CONFLICT_LABEL}`,
  ]);
  await gh(
    [
      'workflow',
      'run',
      'pr-remediation-swarm.yml',
      '-f',
      // The swarm's workflow_dispatch input is `prs` (comma-separated); an
      // undeclared input makes the dispatch fail with HTTP 422 (run 41122896980).
      `prs=${head.number}`,
    ],
    'repair'
  );
  // Green Enroll re-admits the head once the conflict pass pushes and checks are green.
  await gh(
    [
      'workflow',
      'run',
      'merge-queue-green-enroll.yml',
      '-f',
      `pr_number=${head.number}`,
    ],
    'merge'
  );
  const dequeuedAt = new Date(now).toISOString();
  await incident(
    `unmergeable:${head.number}`,
    `queue head #${head.number} UNMERGEABLE ${verdict.dwellMin} min`,
    `Queue head #${head.number} was UNMERGEABLE since ${verdict.since}. Dequeued at ${dequeuedAt}, conflict pass dispatched, Green Enroll will re-enqueue.`
  );
  return { ...verdict, dequeued: true };
}

// ---- failure alert ---------------------------------------------------------

/** The ejector must never fail silently: open/refresh an incident and ping Slack. */
export async function alertFailure() {
  const run = `https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`;
  const text = `Main Red Eject failed (${process.env.GITHUB_EVENT_NAME ?? 'unknown'}): ${run}. The queue head is not being watched until it recovers.`;
  const out = { alerted: [] };
  try {
    await incident('ejector-failed', 'Main Red Eject workflow failing', text);
    out.alerted.push('incident');
  } catch (error) {
    out.incidentError = String(error.message).slice(0, 200);
  }
  if (process.env.SLACK_WEBHOOK_URL) {
    const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (res?.ok) out.alerted.push('slack');
  }
  return out;
}

// ---- cli -------------------------------------------------------------------

if (process.argv[1] === import.meta.filename) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      pr: { type: 'string' },
      apply: { type: 'boolean' },
      out: { type: 'string' },
    },
  });
  const [cmd = 'plan'] = positionals;
  const mode = process.env.MAIN_RED_EJECT_MODE || 'apply';
  let result;
  if (mode === 'off')
    result = { mode, action: 'none', reason: 'kill-switch-off' };
  else if (cmd === 'plan') result = await plan({ mode: 'dry' });
  else if (cmd === 'apply') {
    const p = await plan({ mode });
    result = await apply(p);
  } else if (cmd === 'reopen') result = await reopen(Number(values.pr));
  else if (cmd === 'stuck-head')
    result = await stuckHead({
      doApply: values.apply === true && mode === 'apply',
    });
  else if (cmd === 'alert-failure') result = await alertFailure();
  else throw new Error(`unknown command: ${cmd}`);
  const text = JSON.stringify(result, null, 2);
  if (values.out) writeFileSync(values.out, `${text}\n`);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## main-red-eject ${cmd}\n\n\`\`\`json\n${text}\n\`\`\`\n`
    );
}
