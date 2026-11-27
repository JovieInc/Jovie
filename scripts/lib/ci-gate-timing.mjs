// api-budget: github-app-core 120/hr - one Shipping SLO collection per day, up to 30 runs x 2 job pages x 2 gate cohorts
import { computePercentile } from './ci-duration-ratchet.mjs';
import { attemptJobsPath, CAPS } from './ci-timing-github.mjs';

export const CI_GATE_TIMING_BASIS = 'pr-ready-first-attempt/v1';
const DAY_MS = 86_400_000;
const SAMPLE_LIMIT = 30;
const MIN_SAMPLE = 20;
const MAX_JOB_PAGES = 2;
const READY_JOB = 'PR Ready';

export const CI_GATE_COHORTS = {
  pull_request: {
    workflow: 'source-validation.yml',
    label: 'Source PR Ready',
  },
  merge_group: { workflow: 'ci.yml', label: 'Combined-tree PR Ready' },
};

export const ciGateMetricKey = event => `ci_walltime.${event}.p95`;

function selectRuns(runs, event, since, now) {
  const path = `.github/workflows/${CI_GATE_COHORTS[event].workflow}`;
  return [
    ...new Map(
      (runs ?? [])
        .filter(run => {
          const created = Date.parse(run.created_at);
          return (
            run.event === event &&
            run.path === path &&
            Number.isSafeInteger(run.id) &&
            run.id > 0 &&
            created >= since &&
            created <= now
          );
        })
        .map(run => [run.id, run])
    ).values(),
  ].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
  );
}

async function readGate(run, fetchJson) {
  // Timing starts at the original workflow creation, so only attempt 1
  // can supply a consistent endpoint. New merge groups are new run IDs.
  const attempt = 1;
  const row = {
    runId: run.id,
    attempt,
    head: run.head_sha ?? null,
    createdAt: run.created_at,
    latestWorkflowConclusion: run.conclusion ?? null,
    listedAttempt: run.run_attempt ?? null,
  };
  try {
    const path = attemptJobsPath(run.id, attempt);
    const jobs = [];
    let total = null;
    for (let page = 1; page <= MAX_JOB_PAGES; page++) {
      const result = await fetchJson(`${path}&page=${page}`);
      if (
        !Array.isArray(result?.jobs) ||
        !Number.isSafeInteger(result.total_count) ||
        result.total_count < result.jobs.length ||
        (total !== null && total !== result.total_count)
      )
        return { ...row, outcome: 'missing' };
      total = result.total_count;
      jobs.push(...result.jobs);
      if (jobs.length >= total || result.jobs.length < CAPS.jobsPerPage) break;
    }
    if (jobs.length !== total) return { ...row, outcome: 'missing' };
    const gate = jobs.filter(job => job?.name === READY_JOB);
    if (gate.length === 0 && run.status !== 'completed')
      return { ...row, outcome: 'unfinished' };
    if (gate.length !== 1) return { ...row, outcome: 'missing' };
    const [job] = gate;
    if (
      job.run_id !== run.id ||
      job.run_attempt !== attempt ||
      !Number.isSafeInteger(job.id) ||
      job.id <= 0
    )
      return { ...row, outcome: 'missing' };
    if (job.status !== 'completed')
      return { ...row, jobId: job.id, outcome: 'unfinished' };
    if (!job.conclusion) return { ...row, jobId: job.id, outcome: 'missing' };
    return {
      ...row,
      jobId: job.id,
      outcome: job.conclusion,
      completedAt: job.completed_at ?? null,
    };
  } catch {
    return { ...row, outcome: 'unavailable' };
  }
}

/** Read required endpoints for a bounded recent sample from the report's run inventory. */
export async function collectCiGateEvidence(
  runsByEvent,
  fetchJson,
  { now = Date.now() } = {}
) {
  const cohorts = {};
  for (const event of Object.keys(CI_GATE_COHORTS)) {
    const runs = selectRuns(runsByEvent[event], event, now - 7 * DAY_MS, now);
    const selected = runs.slice(0, SAMPLE_LIMIT);
    const observations = [];
    for (let index = 0; index < selected.length; index += 4) {
      const batch = selected.slice(index, index + 4);
      observations.push(
        ...(await Promise.all(batch.map(run => readGate(run, fetchJson))))
      );
    }
    cohorts[event] = { availableRuns: runs.length, observations };
  }
  return {
    basis: CI_GATE_TIMING_BASIS,
    collectedAt: new Date(now).toISOString(),
    cohorts,
  };
}

/** The percentiles describe successful gates; outcomes count every sampled run. */
export function summarizeCiGateEvidence(evidence, now) {
  const correctBasis = evidence?.basis === CI_GATE_TIMING_BASIS;
  const collectedAt = correctBasis ? Date.parse(evidence.collectedAt) : NaN;
  return Object.fromEntries(
    Object.entries(CI_GATE_COHORTS).map(([event, cohort]) => {
      const source = correctBasis ? evidence.cohorts?.[event] : null;
      const outcomes = {};
      const successful = [];
      for (const row of source?.observations ?? []) {
        let outcome = row.outcome;
        const created = Date.parse(row.createdAt);
        const completed = Date.parse(row.completedAt);
        const validTime =
          created >= now - 7 * DAY_MS &&
          completed > created &&
          completed <= collectedAt;
        // A gate may finish while its jobs page is in flight. It was still
        // running at the sample boundary, so it is outside this percentile.
        if (completed > collectedAt) {
          outcome = 'unfinished';
        } else if (outcome === 'success') {
          if (validTime)
            successful.push({ ...row, seconds: (completed - created) / 1000 });
          else outcome = 'missing';
        }
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      }
      const n = successful.length;
      const latest = n
        ? Math.max(...successful.map(row => Date.parse(row.completedAt)))
        : null;
      const lastSuccessAt =
        latest === null ? null : new Date(latest).toISOString();
      let coverage = 'ready';
      if (!Number.isFinite(collectedAt) || collectedAt > now)
        coverage = 'unavailable';
      else if (
        now - collectedAt > DAY_MS ||
        (latest !== null && now - latest > DAY_MS)
      )
        coverage = 'stale';
      else if (outcomes.missing || outcomes.unavailable)
        coverage = 'incomplete';
      else if (n < MIN_SAMPLE) coverage = 'insufficient';
      const durations = successful.map(row => row.seconds);
      return [
        event,
        {
          ...cohort,
          coverage,
          n,
          p50: coverage === 'ready' ? computePercentile(durations, 50) : null,
          p95: coverage === 'ready' ? computePercentile(durations, 95) : null,
          lastSuccessAt,
          sampled: source?.observations?.length ?? 0,
          availableRuns: source?.availableRuns ?? 0,
          outcomes,
          successful,
        },
      ];
    })
  );
}

/** Consume the single canonical Shipping SLO snapshot on the nightly guard. */
export function checkCiGateSnapshot(snapshot, baseline, now = Date.now()) {
  // The publisher runs after this nightly guard, so it normally checks
  // yesterday's receipt. Allow the schedule offset and normal queue delay.
  const maxAge = 30 * 3_600_000;
  const fresh = value => {
    const age = now - Date.parse(value);
    return age >= 0 && age <= maxAge;
  };
  const timing = snapshot?.ciGateTiming;
  const current =
    timing?.basis === CI_GATE_TIMING_BASIS &&
    fresh(snapshot.at) &&
    fresh(timing.collectedAt);
  const margin = baseline?.thresholds?.regressionFraction ?? 0.2;
  return Object.entries(CI_GATE_COHORTS).map(([event, { label }]) => {
    const cohort = timing?.cohorts?.[event];
    const target = baseline?.metrics?.[ciGateMetricKey(event)]?.value;
    const ceiling =
      Number.isFinite(target) &&
      target > 0 &&
      Number.isFinite(margin) &&
      margin >= 0
        ? target * (1 + margin)
        : null;
    const recentSuccess = fresh(cohort?.lastSuccessAt);
    const qualified =
      current &&
      cohort?.coverage === 'ready' &&
      Number.isSafeInteger(cohort.n) &&
      cohort.n >= MIN_SAMPLE &&
      recentSuccess &&
      Number.isFinite(cohort.p95) &&
      cohort.p95 > 0 &&
      Number.isFinite(ceiling) &&
      ceiling > 0;
    return {
      label,
      status: qualified
        ? cohort.p95 > ceiling
          ? 'breached'
          : 'within SLO'
        : 'unknown',
      p95: qualified ? cohort.p95 : null,
      sampleSize: cohort?.n ?? 0,
      ceiling: Number.isFinite(ceiling) ? ceiling : null,
      coverage: describeCoverage(current, cohort, recentSuccess),
      lastSuccessAt: cohort?.lastSuccessAt ?? null,
      outcomes: cohort?.outcomes ?? {},
    };
  });
}

function describeCoverage(current, cohort, recentSuccess) {
  if (!current) return 'stale or unavailable';
  if (cohort?.coverage === 'ready' && !recentSuccess) return 'stale';
  return cohort?.coverage ?? 'unavailable';
}

export function ciGateSnapshot(ci, evidence, previous, now) {
  const priorDays =
    previous?.basis === CI_GATE_TIMING_BASIS && Array.isArray(previous.daily)
      ? previous.daily
      : [];
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const previousDay = priorDays.find(day => day.date === date);
    const values =
      index === 6
        ? Object.fromEntries(
            Object.entries(ci).map(([event, cohort]) => [
              ciGateMetricKey(event),
              cohort.p95,
            ])
          )
        : (previousDay?.values ?? {});
    return { date, values };
  });
  return {
    basis: CI_GATE_TIMING_BASIS,
    collectedAt: evidence?.collectedAt ?? null,
    cohorts: Object.fromEntries(
      Object.entries(ci).map(([event, { successful, ...cohort }]) => [
        event,
        cohort,
      ])
    ),
    daily,
  };
}

export async function readCiGateEvidence(runs, repo, token) {
  if (!token) return null;
  const { createGitHubClient } = await import(
    '../../packages/api-client/github.ts'
  );
  const signal = AbortSignal.timeout(75_000);
  const client = createGitHubClient({ token });
  return collectCiGateEvidence(runs, async path => {
    signal.throwIfAborted();
    const response = await client.rest(
      'GET',
      path.replace('{owner}/{repo}', repo),
      undefined,
      {
        priority: 'report',
        signal,
        timeoutMs: 8_000,
        maxAttempts: 1,
        maxWaitMs: 0,
      }
    );
    if (response.status !== 200)
      throw new Error(`GitHub job lookup: ${response.status}`);
    return response.json();
  });
}
