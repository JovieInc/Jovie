import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'JovieInc/Jovie';
const WORKFLOW = 'production-controller.yml';
export const ALIAS_ROUTES = [
  'public-profile-listen',
  'public-profile-music',
  'public-profile-releases',
  'public-profile-subscribe',
  'public-profile-tip',
  'public-profile-tour',
];
export const ALIAS_SURFACES = {
  production: {
    surface: 'production-canonical-alias',
    job: 'Production Release / Production public-profile alias usable-result gate',
    step: 'Gate canonical public-profile aliases on usable results',
  },
  staging: {
    surface: 'staging-exact-build',
    job: 'Production Release / Promote to Production',
    step: 'Prove canonical navigation budgets on exact staged build',
  },
};
const digest = value => createHash('sha256').update(value).digest('hex');
export const jsonLines = rows =>
  `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;

// Refuse truncated/paginated provider responses rather than silently omitting jobs.
export function completeList(pages, key) {
  const rows = pages.flatMap(page => page[key]);
  if (
    !pages.length ||
    pages.some(page => page.total_count !== rows.length) ||
    new Set(rows.map(row => row.id)).size !== rows.length
  ) {
    throw new Error(`Incomplete or duplicate ${key} enumeration`);
  }
  return rows;
}

export function parseAliasSamples(log) {
  const samples = {};
  const summaries = {};
  let current;
  let invalid = false;
  for (const raw of log.split('\n')) {
    const line = raw
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/^\uFEFF?\d{4}-\d{2}-\d{2}T\S+ /, '');
    const checking = line.match(/^Checking (\S+) -> /);
    const summary = line.match(
      /^(public-profile-\S+) \(.+\) primary=usable-alias-result=/
    );
    if (checking) {
      current = checking[1];
      if (ALIAS_ROUTES.includes(current)) {
        if (samples[current]) invalid = true;
        samples[current] = [];
      }
    }
    if (summary) current = summary[1];
    const sample = line.match(/^\s+sample (\d+)\/(\d+): ([\d.]+)ms/);
    if (sample && samples[current]) {
      if (+sample[1] !== samples[current].length + 1 || +sample[2] !== 5)
        invalid = true;
      samples[current].push(+sample[3]);
    }
    const maximum = line.match(
      /^\s+(?:PASS|FAIL) usable-alias-result-max: ([\d.]+)ms \/ 1500\.0ms/
    );
    if (maximum && ALIAS_ROUTES.includes(current)) {
      if (Object.hasOwn(summaries, current)) invalid = true;
      summaries[current] = +maximum[1];
    }
  }
  const valid =
    !invalid &&
    ALIAS_ROUTES.every(
      route =>
        samples[route]?.length === 5 &&
        samples[route].every(value => Number.isFinite(value) && value > 0) &&
        Math.max(...samples[route]) === summaries[route]
    );
  return {
    routeSamplesMs: samples,
    routeP95Ms: summaries,
    valid,
    observedP95Ms: valid ? Math.max(...Object.values(summaries)) : null,
    qualifies: valid && Object.values(summaries).every(value => value <= 1500),
  };
}

export function selectAliasWindow(inventory, surface, cutoff) {
  return inventory
    .filter(row => row.status === 'completed' && row.updatedAt <= cutoff)
    .filter(row => {
      const job = row[surface];
      return (
        job?.status === 'completed' &&
        job.completedAt <= cutoff &&
        job.stepStatus === 'completed' &&
        job.stepConclusion &&
        job.stepConclusion !== 'skipped'
      );
    })
    .sort(
      (a, b) =>
        b[surface].completedAt.localeCompare(a[surface].completedAt) ||
        b.controllerRunId - a.controllerRunId
    )
    .slice(0, 14);
}

export function aliasDecision(measurements) {
  const firstMiss = measurements.findIndex(row => !row.qualifies);
  const streak = firstMiss < 0 ? measurements.length : firstMiss;
  return {
    qualifyingRunsInWindow: measurements.filter(row => row.qualifies).length,
    consecutiveQualifyingRuns: streak,
    graduated: streak === 14,
    decision: streak === 14 ? 'block' : 'warn',
  };
}

function ghRequest(path, json = true) {
  const args = ['api', path, ...(json ? ['--paginate', '--slurp'] : [])];
  const value = execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return json ? JSON.parse(value) : value;
}

// A manual evidence refresh only: no new scheduler and no production mutations.
export function collectAliasGraduation({
  since,
  cutoff,
  nextReviewAt,
  trackingIssue,
  request = ghRequest,
}) {
  for (const value of [since, cutoff, nextReviewAt]) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new Error('Expected explicit UTC dates');
  }
  if (
    since >= cutoff ||
    nextReviewAt <= cutoff ||
    Date.parse(nextReviewAt) - Date.parse(cutoff) > 7 * 86400_000
  )
    throw new Error('Expected a bounded window and review within seven days');
  const base = `repos/${REPOSITORY}/actions`;
  const runs = completeList(
    request(
      `${base}/workflows/${WORKFLOW}/runs?per_page=100&created=${since}..${cutoff}`
    ),
    'workflow_runs'
  );
  const inventory = runs
    .map(run => {
      if (
        run.created_at < since ||
        run.created_at > cutoff ||
        run.path !== `.github/workflows/${WORKFLOW}`
      )
        throw new Error('Controller outside requested workflow/window');
      const jobs = completeList(
        request(
          `${base}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
        ),
        'jobs'
      );
      const row = {
        controllerRunId: run.id,
        runAttempt: run.run_attempt,
        headSha: run.head_sha,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        status: run.status,
        conclusion: run.conclusion,
        enumeratedJobCount: jobs.length,
      };
      for (const [key, surface] of Object.entries(ALIAS_SURFACES)) {
        const matches = jobs.filter(job => job.name === surface.job);
        if (matches.length > 1) throw new Error('Duplicate surface job');
        const job = matches[0];
        const step = job?.steps.find(item => item.name === surface.step);
        row[key] = job
          ? {
              jobId: job.id,
              status: job.status,
              conclusion: job.conclusion,
              completedAt: job.completed_at,
              stepNumber: step?.number ?? null,
              stepStatus: step?.status ?? null,
              stepConclusion: step?.conclusion ?? null,
              stepStartedAt: step?.started_at ?? null,
              stepCompletedAt: step?.completed_at ?? null,
            }
          : null;
      }
      return row;
    })
    .sort((a, b) => b.controllerRunId - a.controllerRunId);
  const measurements = [];
  const windows = {};
  for (const [key, surface] of Object.entries(ALIAS_SURFACES)) {
    const selected = selectAliasWindow(inventory, key, cutoff);
    const rows = selected.map(run => {
      const job = run[key];
      const rawLog = request(`${base}/jobs/${job.jobId}/logs`, false);
      // Restrict to the measurement step: staging's job also builds and deploys.
      const log = rawLog
        .split('\n')
        .filter(line => {
          const time = line.replace(/^\uFEFF/, '').match(/^\S+/)?.[0];
          return (
            time &&
            Date.parse(time) >= Date.parse(job.stepStartedAt) &&
            Date.parse(time) < Date.parse(job.stepCompletedAt) + 1000
          );
        })
        .join('\n');
      const staged = rawLog.match(
        /Staged production deployment: (dpl_\w+) \((https:\/\/[\w.-]+\.vercel\.app)\)/
      );
      const testedSha = rawLog.match(
        /git log -1 --format=%H\r?\n\S+ ([0-9a-f]{40})/i
      )?.[1];
      const expectedSha = log.match(/EXPECTED_COMMIT_SHA: ([0-9a-f]{40})/)?.[1];
      const samples = parseAliasSamples(log);
      const identityValid = Boolean(
        testedSha &&
          (key === 'production' || (staged && expectedSha === testedSha))
      );
      return {
        surface: surface.surface,
        controllerRunId: run.controllerRunId,
        runAttempt: run.runAttempt,
        headSha: run.headSha,
        testedSha: testedSha ?? null,
        stagedDeployment:
          key === 'staging' && staged
            ? {
                id: staged[1],
                url: staged[2],
                expectedSha: expectedSha ?? null,
              }
            : null,
        ...job,
        jobUrl: `https://github.com/${REPOSITORY}/actions/runs/${run.controllerRunId}/job/${job.jobId}`,
        logSha256: digest(rawLog),
        ...samples,
        valid: samples.valid && identityValid,
        qualifies: samples.qualifies && identityValid,
      };
    });
    measurements.push(...rows);
    windows[key] = {
      ...surface,
      selectedJobIds: rows.map(row => row.jobId),
      ...aliasDecision(rows),
    };
  }
  const inventoryText = jsonLines(inventory);
  const measurementsText = jsonLines(measurements);
  const receipt = {
    schema: 'jovie-public-profile-alias-graduation/v2',
    repository: REPOSITORY,
    measuredAt: cutoff,
    selection: {
      workflowPath: `.github/workflows/${WORKFLOW}`,
      since,
      cutoff,
      enumeratedControllers: inventory.length,
      windowSize: 14,
      eligibility:
        'completed controllers and completed measurement steps by cutoff, regardless of controller conclusion; partial measurements consume a nonqualifying slot',
      order:
        'measurement job completedAt descending, controllerRunId descending',
    },
    policy: {
      metric: 'usable-alias-result-max',
      samplesPerRoute: 5,
      p95Estimator: 'nearest-rank',
      thresholdMs: 1500,
      requiredConsecutiveRuns: 14,
      nextReviewAt,
      trackingIssue,
    },
    evidence: {
      inventory: 'generated/public-profile-alias-controller-inventory.jsonl',
      inventorySha256: digest(inventoryText),
      measurements: 'generated/public-profile-alias-measurements.jsonl',
      measurementsSha256: digest(measurementsText),
    },
    windows,
  };
  return { receipt, inventoryText, measurementsText };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [since, cutoff, nextReviewAt, trackingIssue] = process.argv.slice(2);
  const result = collectAliasGraduation({
    since,
    cutoff,
    nextReviewAt,
    trackingIssue,
  });
  const root = new URL('../../docs/performance/', import.meta.url);
  mkdirSync(new URL('generated/', root), { recursive: true });
  writeFileSync(
    new URL('public-profile-alias-graduation.json', root),
    `${JSON.stringify(result.receipt, null, 2)}\n`
  );
  writeFileSync(
    new URL(result.receipt.evidence.inventory, root),
    result.inventoryText
  );
  writeFileSync(
    new URL(result.receipt.evidence.measurements, root),
    result.measurementsText
  );
}
