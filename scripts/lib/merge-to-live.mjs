// Merge-to-live lead time per production promotion (REST only).
// A promotion's lead time is the merge (commit on main) of its generation to
// the completion of the "Promote to Production" job, which is the alias move.
// Stages: ci_staging (merge to Production Controller start), prod_queue
// (controller start to first job), pre_promote (first job to promote start),
// promote. Pure functions so they are unit tested; the CLI does the REST reads.

const PROMOTE = /Promote to Production$/;
const MS = 1000;

export const percentile = (sorted, p) =>
  sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

export function shaFromTitle(title) {
  return /Controller ([0-9a-f]{40})/.exec(title ?? '')?.[1] ?? null;
}

// One row per generation: the earliest successful promote across reruns.
export function promotionRows(runs) {
  const bySha = new Map();
  for (const { run, jobs, mergedAt } of runs) {
    const sha = shaFromTitle(run.display_title ?? run.name);
    const promote = (jobs ?? []).find(
      j => PROMOTE.test(j.name) && j.conclusion === 'success'
    );
    if (!sha || !promote || !mergedAt) continue;
    const started = jobs
      .map(j => Date.parse(j.started_at))
      .filter(Number.isFinite);
    const first = Math.min(...started);
    const row = {
      sha,
      runId: run.id,
      mergedAt,
      liveAt: promote.completed_at,
      leadSeconds:
        (Date.parse(promote.completed_at) - Date.parse(mergedAt)) / MS,
      stages: {
        ci_staging: (Date.parse(run.created_at) - Date.parse(mergedAt)) / MS,
        prod_queue: (first - Date.parse(run.created_at)) / MS,
        pre_promote: (Date.parse(promote.started_at) - first) / MS,
        promote:
          (Date.parse(promote.completed_at) - Date.parse(promote.started_at)) /
          MS,
      },
    };
    const prev = bySha.get(sha);
    if (!prev || row.liveAt < prev.liveAt) bySha.set(sha, row);
  }
  return [...bySha.values()].sort((a, b) => (a.liveAt < b.liveAt ? 1 : -1));
}

const stat = values => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { n: s.length, p50: percentile(s, 0.5), p95: percentile(s, 0.95) };
};

export function summarize(rows, { limit = 10, now = new Date() } = {}) {
  const latest = rows.slice(0, limit);
  const stages = {};
  for (const key of ['ci_staging', 'prod_queue', 'pre_promote', 'promote'])
    stages[key] = stat(latest.map(r => r.stages[key]));
  const slowestStage =
    Object.entries(stages).sort(
      (a, b) => (b[1].p50 ?? 0) - (a[1].p50 ?? 0)
    )[0]?.[0] ?? null;
  return {
    schema: 'jovie-merge-to-live/v1',
    generatedAt: now.toISOString(),
    unit: 'seconds',
    promotions: latest.length,
    leadSeconds: stat(latest.map(r => r.leadSeconds)),
    stages,
    slowestStage,
    latest: latest.map(r => ({
      sha: r.sha.slice(0, 7),
      mergedAt: r.mergedAt,
      liveAt: r.liveAt,
      leadSeconds: r.leadSeconds,
      receipt: `https://github.com/JovieInc/Jovie/actions/runs/${r.runId}`,
    })),
  };
}

export function digestBlock(summary) {
  const m = x => (x == null ? 'n/a' : `${Math.round(x / 60)}m`);
  return [
    `merge->live (last ${summary.promotions} promotions): p50 ${m(summary.leadSeconds.p50)}, p95 ${m(summary.leadSeconds.p95)}, slowest stage ${summary.slowestStage}`,
  ].join('\n');
}
