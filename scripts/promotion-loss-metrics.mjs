#!/usr/bin/env node
/**
 * Promotion-loss metrics (JOV-6836): where do PRs lose time on the way to main?
 * Deterministic, GitHub API only (via `gh`), no LLM.
 *
 *   node scripts/promotion-loss-metrics.mjs --since 8h [--until <ISO>] [--json] [--runner-minutes]
 * Snapshot metrics (queue now, CLEAN-not-queued, keys with >1 open PR) are always "now".
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseTrustedFailureStatus } from './merge-group-failure-hold.mjs';

export const REPO = 'JovieInc/Jovie';
const MINUTE_MS = 60_000;
const UNITS = { m: MINUTE_MS, h: 60 * MINUTE_MS, d: 24 * 60 * MINUTE_MS };
const KEY_PATTERNS = [
  /linear-issue-id:\s*(JOV-\d+)/i,
  /(?:^|\/)(jov-\d+)(?:-|$)/i,
  /\b(JOV-\d+)\b/,
];

/** @param {string} value e.g. "8h", "90m", "1d" @returns {number} milliseconds */
export function parseWindow(value) {
  const match = /^(\d+)([mhd])$/.exec(String(value ?? ''));
  if (!match)
    throw new Error(`--since must look like 90m, 8h or 1d (got ${value})`);
  return Number(match[1]) * UNITS[match[2]];
}

/** Linear key from the PR marker, then branch, then title. */
export function linearKey(pr) {
  const sources = [pr.body ?? '', pr.headRefName ?? '', pr.title ?? ''];
  for (const [index, pattern] of KEY_PATTERNS.entries()) {
    const match = pattern.exec(sources[index]);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

/** Nearest-rank percentile of minutes, rounded to 0.1. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return Math.round(sorted[rank - 1] * 10) / 10;
}

const stats = values => ({
  n: values.length,
  p50: percentile(values, 50),
  p75: percentile(values, 75),
});
const minutes = (from, to) => (Date.parse(to) - Date.parse(from)) / MINUTE_MS;
const inWindow = (stamp, since, until = Infinity) =>
  Boolean(stamp) && Date.parse(stamp) >= since && Date.parse(stamp) <= until;

/**
 * @param {{ prs: object[], openPrs: object[], queue: object, runs: object[], since: number, now: number }} input
 *   prs: PRs updated in the window with queue timeline events (oldest first).
 *   openPrs: snapshot of open PRs to main. runs: CI workflow runs created in the window.
 */
export function computeMetrics({ prs, openPrs, queue, runs, since, now }) {
  let firstPass = 0;
  let resolved = 0;
  const removals = {};
  const reenqueue = [];
  let reenqueuePending = 0;
  const openToFirstEnqueue = [];
  const lastEnqueueToMerged = [];

  for (const pr of prs) {
    const events = pr.events ?? [];
    events.forEach((event, index) => {
      const next = events[index + 1];
      // An entry re-added with no recorded removal has an unknown outcome; skip it.
      if (
        event.type === 'added' &&
        inWindow(event.at, since, now) &&
        next &&
        next.type !== 'added'
      ) {
        resolved += 1;
        if (next.type === 'merged') firstPass += 1;
      }
      if (event.type === 'removed' && inWindow(event.at, since, now)) {
        removals[event.reason] = (removals[event.reason] ?? 0) + 1;
        if (event.reason === 'failed_checks') {
          const back = events.slice(index + 1).find(e => e.type === 'added');
          if (back) reenqueue.push(minutes(event.at, back.at));
          else if (pr.state === 'OPEN') reenqueuePending += 1;
        }
      }
    });
    const added = events.filter(event => event.type === 'added');
    if (added.length > 0 && inWindow(added[0].at, since, now)) {
      openToFirstEnqueue.push(minutes(pr.createdAt, added[0].at));
    }
    if (pr.mergedAt && inWindow(pr.mergedAt, since, now) && added.length > 0) {
      lastEnqueueToMerged.push(minutes(added.at(-1).at, pr.mergedAt));
    }
  }

  const hours = (now - since) / UNITS.h;
  const opened = prs.filter(pr => inWindow(pr.createdAt, since, now));
  const merged = prs.filter(pr => inWindow(pr.mergedAt, since, now));
  const queueEntries = prs.reduce(
    (total, pr) =>
      total +
      (pr.events ?? []).filter(
        event => event.type === 'added' && inWindow(event.at, since, now)
      ).length,
    0
  );
  const closedUnmerged = opened.filter(
    pr => pr.state === 'CLOSED' && !pr.mergedAt
  );
  const byKey = {};
  for (const pr of openPrs) {
    const key = linearKey(pr);
    if (key) byKey[key] = (byKey[key] ?? 0) + 1;
  }
  const multi = Object.entries(byKey).filter(([, count]) => count > 1);
  const mergeGroupRuns = runs.filter(run => run.event === 'merge_group');
  const heldRevisions = prs
    .map(pr => ({
      number: pr.number,
      receipts: Array.isArray(pr.failureReceipts) ? pr.failureReceipts : [],
    }))
    .filter(pr => pr.receipts.length > 0);
  const deterministicFailureRecurrence = heldRevisions.reduce((total, pr) => {
    if (
      !pr.receipts.some(
        receipt => receipt.classification === 'deterministic-source'
      )
    ) {
      return total;
    }
    return (
      total +
      Math.max(
        0,
        Math.max(...pr.receipts.map(receipt => receipt.failureNumber)) - 1
      )
    );
  }, 0);
  const minutesBy = event => {
    const timed = runs.filter(
      run => run.event === event && run.minutes != null
    );
    return timed.length
      ? timed.reduce((sum, run) => sum + run.minutes, 0)
      : null;
  };
  const perMerged = total =>
    total == null || merged.length === 0
      ? null
      : Math.round((total / merged.length) * 10) / 10;

  return {
    window: {
      since: new Date(since).toISOString(),
      hours: Math.round(hours * 10) / 10,
    },
    queueEntries,
    queueEntriesPerMerge: merged.length
      ? Math.round((queueEntries / merged.length) * 10) / 10
      : null,
    firstPass: {
      rate: resolved ? Math.round((firstPass / resolved) * 1000) / 1000 : null,
      merged: firstPass,
      resolvedEntries: resolved,
    },
    ejections: {
      byReason: removals,
      mergeGroupRuns: mergeGroupRuns.length,
      mergeGroupFailed: mergeGroupRuns.filter(
        run => run.conclusion === 'failure'
      ).length,
      mergeGroupRunsPerMergedPr: merged.length
        ? Math.round((mergeGroupRuns.length / merged.length) * 100) / 100
        : null,
      revisionFailureHolds: heldRevisions.length,
      deterministicFailureRecurrence,
    },
    occupancy: {
      inQueue: openPrs.filter(pr => pr.isInMergeQueue).length,
      maxEntriesToBuild: queue.maxEntriesToBuild ?? null,
      cleanNotQueued: openPrs.filter(
        pr =>
          !pr.isDraft && pr.mergeStateStatus === 'CLEAN' && !pr.isInMergeQueue
      ).length,
    },
    reenqueueMinutes: { ...stats(reenqueue), pending: reenqueuePending },
    openToFirstEnqueueMinutes: stats(openToFirstEnqueue),
    lastEnqueueToMergedMinutes: stats(lastEnqueueToMerged),
    intake: {
      opened: opened.length,
      merged: merged.length,
      opensPerHour: Math.round((opened.length / hours) * 10) / 10,
      mergesPerHour: Math.round((merged.length / hours) * 10) / 10,
      closedUnmergedOfOpened: closedUnmerged.length,
      openPrs: openPrs.length,
      keysWithMultipleOpenPrs: multi.length,
      prsInThoseKeys: multi.reduce((sum, [, count]) => sum + count, 0),
    },
    runnerMinutesPerMergedPr: {
      pullRequest: perMerged(minutesBy('pull_request')),
      mergeGroup: perMerged(minutesBy('merge_group')),
    },
  };
}

export function toEvents(nodes) {
  const type = {
    AddedToMergeQueueEvent: 'added',
    RemovedFromMergeQueueEvent: 'removed',
    MergedEvent: 'merged',
  };
  return (
    nodes
      // GitHub also records a `merged` removal beside every MergedEvent; it is not an ejection.
      .filter(node => node.reason !== 'merged')
      .map(node => ({
        type: type[node.__typename],
        at: node.createdAt,
        reason: node.reason,
      }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  );
}

const fmt = value => (value == null ? 'n/a' : String(value));

/** GitHub-flavored markdown for a job summary or the HUD. */
export function renderMarkdown(m) {
  const reasons =
    Object.entries(m.ejections.byReason)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(', ') || 'none';
  const pct =
    m.firstPass.rate == null ? 'n/a' : `${Math.round(m.firstPass.rate * 100)}%`;
  return [
    `### Promotion-loss metrics (last ${m.window.hours} h)`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Merge-group first-pass rate | ${pct} (${m.firstPass.merged}/${m.firstPass.resolvedEntries} entries) |`,
    `| Queue removals by reason | ${reasons} |`,
    `| Queue entries / per merged PR | ${m.queueEntries} / ${fmt(m.queueEntriesPerMerge)} |`,
    `| merge_group CI runs (failed) / per merged PR | ${m.ejections.mergeGroupRuns} (${m.ejections.mergeGroupFailed}) / ${fmt(m.ejections.mergeGroupRunsPerMergedPr)} |`,
    `| Revision failure holds / deterministic same-head recurrence | ${m.ejections.revisionFailureHolds} / ${m.ejections.deterministicFailureRecurrence} |`,
    `| Queue now: entries / max build · CLEAN PRs not queued | ${m.occupancy.inQueue} / ${fmt(m.occupancy.maxEntriesToBuild)} · ${m.occupancy.cleanNotQueued} |`,
    `| Ejection → re-enqueue min p50/p75 (n, still waiting) | ${fmt(m.reenqueueMinutes.p50)} / ${fmt(m.reenqueueMinutes.p75)} (${m.reenqueueMinutes.n}, ${m.reenqueueMinutes.pending}) |`,
    `| Open → first enqueue min p50/p75 (n) | ${fmt(m.openToFirstEnqueueMinutes.p50)} / ${fmt(m.openToFirstEnqueueMinutes.p75)} (${m.openToFirstEnqueueMinutes.n}) |`,
    `| Last enqueue → merged min p50/p75 (n) | ${fmt(m.lastEnqueueToMergedMinutes.p50)} / ${fmt(m.lastEnqueueToMergedMinutes.p75)} (${m.lastEnqueueToMergedMinutes.n}) |`,
    `| Opens/h vs merges/h · closed unmerged of opened | ${m.intake.opensPerHour} vs ${m.intake.mergesPerHour} · ${m.intake.closedUnmergedOfOpened}/${m.intake.opened} |`,
    `| Open PRs · Linear keys with >1 open PR (PRs) | ${m.intake.openPrs} · ${m.intake.keysWithMultipleOpenPrs} (${m.intake.prsInThoseKeys}) |`,
    `| Runner-min per merged PR: pull_request / merge_group | ${fmt(m.runnerMinutesPerMergedPr.pullRequest)} / ${fmt(m.runnerMinutesPerMergedPr.mergeGroup)} |`,
  ].join('\n');
}

// ---------------------------------------------------------------- GitHub collection

// Network I/O only; computeMetrics carries the logic and the tests.
/* node:coverage disable */
function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function graphqlPages(query, variables, pick) {
  const nodes = [];
  let cursor = null;
  do {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [name, value] of Object.entries(variables))
      args.push('-f', `${name}=${value}`);
    if (cursor) args.push('-f', `cursor=${cursor}`);
    const page = pick(JSON.parse(gh(args)).data);
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

const QUEUE_EVENTS = `timelineItems(first: 100, itemTypes: [ADDED_TO_MERGE_QUEUE_EVENT, REMOVED_FROM_MERGE_QUEUE_EVENT, MERGED_EVENT]) {
  nodes { __typename
    ... on AddedToMergeQueueEvent { createdAt }
    ... on RemovedFromMergeQueueEvent { createdAt reason }
    ... on MergedEvent { createdAt } } }
  commits(last: 1) { nodes { commit { status { contexts {
    context state description targetUrl creator { __typename login }
  } } } } }`;

function collect({ since, until, runnerMinutes }) {
  const [owner, name] = REPO.split('/');
  const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const sinceIso = iso(since);
  const prs = graphqlPages(
    `query($q: String!, $cursor: String) { search(query: $q, type: ISSUE, first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { number title headRefName state createdAt mergedAt ${QUEUE_EVENTS} } } } }`,
    { q: `repo:${REPO} is:pr base:main updated:>=${sinceIso}` },
    data => data.search
  ).map(pr => ({
    ...pr,
    events: toEvents(pr.timelineItems.nodes),
    failureReceipts: (pr.commits?.nodes?.[0]?.commit?.status?.contexts ?? [])
      .map(status => parseTrustedFailureStatus(status, REPO))
      .filter(Boolean),
  }));
  const openPrs = graphqlPages(
    `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) {
      pullRequests(states: OPEN, baseRefName: "main", first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { number title body headRefName isDraft mergeStateStatus isInMergeQueue } } } }`,
    { owner, name },
    data => data.repository.pullRequests
  );
  const rules = JSON.parse(gh(['api', `repos/${REPO}/rules/branches/main`]));
  const queue =
    rules.find(rule => rule.type === 'merge_queue')?.parameters ?? {};
  const runs = [];
  for (const event of ['merge_group', 'pull_request']) {
    const pages = JSON.parse(
      gh([
        'api',
        '--paginate',
        '--slurp',
        `repos/${REPO}/actions/workflows/ci.yml/runs?event=${event}&created=${sinceIso}..${iso(until)}&per_page=100`,
      ])
    );
    for (const run of pages.flatMap(page => page.workflow_runs)) {
      let total = null;
      if (runnerMinutes) {
        const jobs = JSON.parse(
          gh([
            'api',
            '--paginate',
            '--slurp',
            `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`,
          ])
        ).flatMap(page => page.jobs);
        total = jobs
          .filter(job => job.started_at && job.completed_at)
          .reduce(
            (sum, job) => sum + minutes(job.started_at, job.completed_at),
            0
          );
      }
      runs.push({ event, conclusion: run.conclusion, minutes: total });
    }
  }
  return {
    prs,
    openPrs,
    queue: { maxEntriesToBuild: queue.max_entries_to_build },
    runs,
  };
}

function main(argv) {
  const flag = name => argv.includes(name);
  const sinceArg = argv[argv.indexOf('--since') + 1];
  const now = argv.includes('--until')
    ? Date.parse(argv[argv.indexOf('--until') + 1])
    : Date.now();
  if (Number.isNaN(now)) throw new Error('--until must be an ISO timestamp');
  const since = now - parseWindow(argv.includes('--since') ? sinceArg : '24h');
  const metrics = computeMetrics({
    ...collect({ since, until: now, runnerMinutes: flag('--runner-minutes') }),
    since,
    now,
  });
  process.stdout.write(
    `${flag('--json') ? JSON.stringify(metrics, null, 2) : renderMarkdown(metrics)}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      `promotion-loss-metrics: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }
}
/* node:coverage enable */
