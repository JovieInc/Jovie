// Merge-queue cancel-cause and decided-red-rate breakdown (JOV-13109).
// Pure functions; the offline CLI lives in scripts/merge-queue-cancel-causes.mjs.
//
// Why: in the Nov 12-19 2026 window 46.3% of CI merge_group runs were
// cancelled and 44.0% of decided runs were red, so ~70% of merge-group runs
// never produced a merge. Batching cannot move that (GitHub merge limits do not
// combine merge_group builds); only fewer failures and fewer invalidated
// groups can. This module says WHY each cancelled run was cancelled, using
// only facts in the run list, so the fix lands on the real cause.
//
// Structure it relies on: a native-queue ref is
// gh-readonly-queue/main/pr-<N>-<base_sha>, and <base_sha> is the head_sha of
// the group directly ahead (or the main tip, which is the last merged group's
// head). So each run points at the run ahead of it and the chain is exact.
//
// Read-only and deterministic: no network, no ruleset, no clock.

export const SCHEMA = 'jovie-merge-queue-cancel-causes/v1';
// Tim-approved 2026-10-29 (.github/rulesets/branch-protection.yml). Measured,
// never changed, by this module. Do not write 20 back (JOV-9864 is stale).
export const CHECK_RESPONSE_TIMEOUT_MINUTES = 30;
// A cancel is attributed to the failure ahead only if that failure had
// completed by the time this run was cancelled (plus API clock slack).
export const CASCADE_SLACK_SECONDS = 120;

export const CANCEL_CAUSES = Object.freeze([
  'ejection_cascade', // a ci.yml failure ahead invalidated this group (direct or through cancelled groups)
  'other_workflow_eject', // another required merge_group workflow (PR Size Guard, Company guards, ...) failed on this group or one ahead
  'timeout_eject', // the chain root ran into the 30-min check response timeout
  'supersession', // group rebuilt with a green base: an entry ahead was dequeued/requeued, PR re-queued
  'dequeue', // the root PR left the queue for good (no later group, not merged)
  'concurrency_duplicate_head', // a later run on the same head_sha (CI concurrency group) replaced this one
  'unknown_base', // the run ahead is outside the dataset; cause not provable
]);

const QUEUE_REF =
  /^(?:refs\/heads\/)?gh-readonly-queue\/main\/pr-([1-9][0-9]*)-([0-9a-f]{40})$/;

export function parseQueueRef(ref) {
  const m = QUEUE_REF.exec(String(ref ?? ''));
  return m ? { pr: Number(m[1]), baseSha: m[2] } : null;
}

const ts = s => Date.parse(s);
const round = (n, d = 1) =>
  Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null;
const pct = (num, den) => (den > 0 ? round((100 * num) / den, 1) : null);

function wallMinutes(run) {
  const s =
    (ts(run.updated_at) - ts(run.run_started_at ?? run.created_at)) / 60000;
  return Number.isFinite(s) && s >= 0 ? s : null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1)
  );
  return sorted[i];
}

/** Merged PR numbers from `git log --format='%H %cI %s'` lines of main (squash subjects end in "(#N)"). */
export function mergedPrsFromGitLog(text) {
  const prs = new Set();
  for (const line of String(text).split('\n')) {
    const m = /\(#([1-9][0-9]*)\)\s*$/.exec(line);
    if (m) prs.add(Number(m[1]));
  }
  return prs;
}

/**
 * Fold the merge_group verdicts of every required workflow on one head SHA
 * into one verdict. failure/timed_out beats cancelled beats pending beats
 * success. `deciders` names the workflows that set the verdict.
 * @param {Record<string, {conclusion: string|null, status?: string}|undefined>} byWorkflow
 */
export function aggregateVerdict(byWorkflow, requiredWorkflows) {
  const rank = {
    failure: 4,
    timed_out: 4,
    cancelled: 3,
    pending: 2,
    success: 1,
  };
  let verdict = 'success';
  let deciders = [];
  for (const name of requiredWorkflows) {
    const run = byWorkflow[name];
    let c = run?.status === 'completed' ? run.conclusion : 'pending';
    if (c === 'skipped' || c === 'neutral') c = 'success';
    if (!(c in rank)) c = 'failure'; // unknown conclusions fail closed
    if (c === 'timed_out') c = 'failure';
    if (rank[c] > rank[verdict]) {
      verdict = c;
      deciders = [name];
    } else if (rank[c] === rank[verdict] && c !== 'success')
      deciders.push(name);
  }
  return { verdict, deciders };
}

/** Index runs of other required merge_group workflows by head_sha. Latest attempt wins. */
export function indexByHead(runs) {
  const byHead = new Map();
  for (const run of runs ?? []) {
    const prev = byHead.get(run.head_sha);
    if (!prev || (run.run_attempt ?? 1) >= (prev.run_attempt ?? 1))
      byHead.set(run.head_sha, run);
  }
  return byHead;
}

/**
 * Classify every CI merge_group run and summarize.
 * @param {object[]} ciRuns completed CI (ci.yml) merge_group runs, latest attempt each
 * @param {{mergedPrs?: Set<number>, otherWorkflows?: Record<string, object[]>, window?: {since: string, until: string}}} opts
 */
export function analyze(
  ciRuns,
  { mergedPrs = new Set(), otherWorkflows = {}, window = null } = {}
) {
  const runs = [];
  for (const run of ciRuns) {
    if (run.status !== 'completed') continue;
    if (
      window &&
      (ts(run.created_at) < ts(window.since) ||
        ts(run.created_at) >= ts(window.until))
    )
      continue;
    const ref = parseQueueRef(run.head_branch);
    if (!ref) continue;
    runs.push({ ...run, ...ref });
  }
  runs.sort((a, b) => ts(a.created_at) - ts(b.created_at) || a.id - b.id);

  const byHead = new Map();
  const byPr = new Map();
  for (const r of runs) {
    if (!byHead.has(r.head_sha)) byHead.set(r.head_sha, []);
    byHead.get(r.head_sha).push(r);
    if (!byPr.has(r.pr)) byPr.set(r.pr, []);
    byPr.get(r.pr).push(r);
  }
  const otherIdx = Object.fromEntries(
    Object.entries(otherWorkflows).map(([name, list]) => [
      name,
      indexByHead(list),
    ])
  );
  const otherNames = Object.keys(otherIdx).sort();
  const aheadOf = r => {
    const list = byHead.get(r.baseSha);
    return list ? list[list.length - 1] : null;
  };
  // Folded verdict of the other required workflows on one head (aggregate
  // verdict). Returns the failing workflows and when the first one finished.
  const otherFailedAt = headSha => {
    if (!otherNames.length) return null;
    const by = Object.fromEntries(
      otherNames.map(n => [n, otherIdx[n].get(headSha)])
    );
    const present = otherNames.filter(n => by[n]);
    const agg = aggregateVerdict(by, present);
    if (agg.verdict !== 'failure') return null;
    const doneAt = Math.min(...agg.deciders.map(n => ts(by[n].updated_at)));
    return { workflows: agg.deciders, doneAt };
  };
  const inTime = (doneAt, r) =>
    doneAt <= ts(r.updated_at) + CASCADE_SLACK_SECONDS * 1000;
  const hasLaterRun = r =>
    (byPr.get(r.pr) ?? []).some(
      x => x.id !== r.id && ts(x.created_at) > ts(r.created_at)
    );

  const memo = new Map();
  // Root trigger for a cancelled run. Walks up through cancelled groups ahead.
  // Priority: duplicate head > red other workflow on this head > red ci.yml
  // ahead (finished in time) > inherit from a cancelled group ahead > root.
  function cancelCause(r, seen = new Set()) {
    if (memo.has(r.id)) return memo.get(r.id);
    let out;
    const dup = (byHead.get(r.head_sha) ?? []).some(
      x => x.id !== r.id && ts(x.created_at) > ts(r.created_at)
    );
    const ahead = aheadOf(r);
    const aheadDoneInTime = ahead && inTime(ts(ahead.updated_at), r);
    const own = otherFailedAt(r.head_sha);
    if (dup)
      out = { cause: 'concurrency_duplicate_head', depth: 0, rootId: r.id };
    else if (own && inTime(own.doneAt, r))
      out = {
        cause: 'other_workflow_eject',
        depth: 0,
        rootId: r.id,
        workflows: own.workflows,
      };
    else if (!ahead) out = { cause: 'unknown_base', depth: 0, rootId: r.id };
    else if (
      ahead.conclusion === 'failure' ||
      ahead.conclusion === 'timed_out'
    ) {
      out = aheadDoneInTime
        ? { cause: 'ejection_cascade', depth: 0, rootId: ahead.id }
        : rootCause(r);
    } else if (ahead.conclusion === 'cancelled' && !seen.has(ahead.id)) {
      seen.add(r.id);
      const up = cancelCause(ahead, seen);
      out = { ...up, depth: up.depth + 1 };
    } else {
      out = rootCause(r);
    }
    memo.set(r.id, out);
    return out;
  }
  // The run itself is where the invalidation started (its base was not a ci.yml failure).
  function rootCause(r) {
    const ahead = aheadOf(r);
    const other = ahead ? otherFailedAt(ahead.head_sha) : null;
    if (other && inTime(other.doneAt, r))
      return {
        cause: 'other_workflow_eject',
        depth: 0,
        rootId: ahead.id,
        workflows: other.workflows,
      };
    const wall = wallMinutes(r);
    if (wall !== null && wall >= CHECK_RESPONSE_TIMEOUT_MINUTES - 0.5)
      return { cause: 'timeout_eject', depth: 0, rootId: r.id };
    if (hasLaterRun(r) || mergedPrs.has(r.pr))
      return { cause: 'supersession', depth: 0, rootId: r.id };
    return { cause: 'dequeue', depth: 0, rootId: r.id };
  }

  const counts = {
    success: 0,
    failure: 0,
    cancelled: 0,
    timed_out: 0,
    other: 0,
  };
  const cancel = Object.fromEntries(
    CANCEL_CAUSES.map(c => [c, { direct: 0, transitive: 0, total: 0 }])
  );
  const failureAhead = {
    independent: 0,
    failed_ahead: 0,
    cancelled_ahead: 0,
    unknown_base: 0,
  };
  const otherEjectWorkflows = {};
  const walls = [];
  const byDay = {};
  let overTimeout = 0;
  const classified = [];
  for (const r of runs) {
    const c = r.conclusion in counts ? r.conclusion : 'other';
    counts[c] += 1;
    const wall = wallMinutes(r);
    if (c === 'success' || c === 'failure' || c === 'timed_out') {
      if (wall !== null) walls.push(wall);
      if (wall !== null && wall >= CHECK_RESPONSE_TIMEOUT_MINUTES)
        overTimeout += 1;
    }
    const day = String(r.created_at).slice(0, 10);
    byDay[day] ??= {
      runs: 0,
      cancelled: 0,
      other_workflow_eject: 0,
      ejection_cascade: 0,
    };
    byDay[day].runs += 1;
    if (c === 'cancelled') {
      const k = cancelCause(r);
      byDay[day].cancelled += 1;
      if (k.cause in byDay[day]) byDay[day][k.cause] += 1;
      const slot = cancel[k.cause];
      slot.total += 1;
      slot[k.depth === 0 ? 'direct' : 'transitive'] += 1;
      for (const w of k.workflows ?? [])
        otherEjectWorkflows[w] = (otherEjectWorkflows[w] ?? 0) + 1;
      classified.push({
        id: r.id,
        pr: r.pr,
        cause: k.cause,
        depth: k.depth,
        root_id: k.rootId,
      });
    } else if (c === 'failure' || c === 'timed_out') {
      const a = aheadOf(r);
      const key = !a
        ? 'unknown_base'
        : a.conclusion === 'failure' || a.conclusion === 'timed_out'
          ? 'failed_ahead'
          : a.conclusion === 'cancelled'
            ? 'cancelled_ahead'
            : 'independent';
      failureAhead[key] += 1;
    }
  }
  walls.sort((a, b) => a - b);
  const completed = runs.length;
  const decided = counts.success + counts.failure + counts.timed_out;
  const red = counts.failure + counts.timed_out;
  const mergedInRuns = new Set(
    runs.filter(r => mergedPrs.has(r.pr)).map(r => r.pr)
  );
  const prsInQueue = byPr.size;

  return {
    schema: SCHEMA,
    window,
    source: 'ci.yml merge_group runs (latest attempt) + main git log',
    runs: completed,
    counts,
    rates: {
      red_a_failure_over_completed_pct: pct(red, completed),
      red_b_decided_pct: pct(red, decided),
      cancel_rate_pct: pct(counts.cancelled, completed),
    },
    cancel_causes: Object.fromEntries(
      CANCEL_CAUSES.map(c => [
        c,
        { ...cancel[c], share_pct: pct(cancel[c].total, counts.cancelled) },
      ])
    ),
    other_workflow_eject_by_workflow: otherEjectWorkflows,
    other_workflows_measured: otherNames,
    failures_by_ahead: Object.fromEntries(
      Object.entries(failureAhead).map(([k, v]) => [
        k,
        { n: v, share_pct: pct(v, red) },
      ])
    ),
    timeout_metric: {
      check_response_timeout_minutes: CHECK_RESPONSE_TIMEOUT_MINUTES,
      decided_wall_minutes_p50: round(percentile(walls, 0.5)),
      decided_wall_minutes_p95: round(percentile(walls, 0.95)),
      decided_runs_at_or_over_timeout: overTimeout,
    },
    // UTC days; a queue-wide incident (one bad main) shows as a single-day spike.
    by_day_utc: Object.fromEntries(
      Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
    ),
    queue: {
      prs_with_runs: prsInQueue,
      merged_prs_with_runs: mergedInRuns.size,
      runs_per_merged_pr: mergedInRuns.size
        ? round(completed / mergedInRuns.size, 2)
        : null,
    },
    classified,
  };
}

/** Short markdown for the Linear issue / PR body. */
export function toMarkdown(report) {
  const r = report.rates;
  const lines = [
    `Window: ${report.window ? `${report.window.since} .. ${report.window.until}` : 'all input'} | source: ${report.source}`,
    `Runs ${report.runs}: success ${report.counts.success} / failure ${report.counts.failure} / cancelled ${report.counts.cancelled} / timed_out ${report.counts.timed_out}`,
    `Red A (failure/completed) ${r.red_a_failure_over_completed_pct}% | Red B (decided) ${r.red_b_decided_pct}% | Cancel ${r.cancel_rate_pct}%`,
    '',
    '| cancel cause | total | direct | via cancelled groups | share of cancels |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [k, v] of Object.entries(report.cancel_causes))
    lines.push(
      `| ${k} | ${v.total} | ${v.direct} | ${v.transitive} | ${v.share_pct ?? 0}% |`
    );
  lines.push(
    '',
    '| failure, run directly ahead was | n | share of red |',
    '| --- | ---: | ---: |'
  );
  for (const [k, v] of Object.entries(report.failures_by_ahead))
    lines.push(`| ${k} | ${v.n} | ${v.share_pct ?? 0}% |`);
  const t = report.timeout_metric;
  lines.push(
    '',
    `Timeout metric: decided wall p50 ${t.decided_wall_minutes_p50} min, p95 ${t.decided_wall_minutes_p95} min, ${t.decided_runs_at_or_over_timeout} decided runs >= ${t.check_response_timeout_minutes} min (timeout unchanged at ${t.check_response_timeout_minutes}).`,
    'By UTC day (runs / cancelled / other_workflow_eject / ejection_cascade): ' +
      Object.entries(report.by_day_utc)
        .map(
          ([d, v]) =>
            `${d} ${v.runs}/${v.cancelled}/${v.other_workflow_eject}/${v.ejection_cascade}`
        )
        .join(', '),
    `Queue: ${report.queue.prs_with_runs} PRs with runs, ${report.queue.merged_prs_with_runs} merged, ${report.queue.runs_per_merged_pr} CI merge_group runs per merged PR.`,
    report.other_workflows_measured.length
      ? `Other required merge_group workflows folded in: ${report.other_workflows_measured.join(', ')}.`
      : 'Other required merge_group workflows NOT measured (v1 gap): their ejections show up as supersession.'
  );
  return lines.join('\n');
}
