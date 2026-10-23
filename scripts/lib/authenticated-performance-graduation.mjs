import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'JovieInc/Jovie';
const WORKFLOW = 'production-controller.yml';
const JOB = 'Production Release / Promote to Production';
const STEP = 'Prove canonical navigation budgets on exact staged build';
const SCHEMA = 'jovie-authenticated-performance-graduation/v1';
const ROOT = new URL('../../docs/performance/', import.meta.url);
export const AUTHENTICATED_ROUTES = [
  'creator-calendar',
  'creator-chat-nav',
  'creator-contacts',
  'creator-inbox-nav',
  'creator-library',
  'creator-tasks',
];
const digest = value => createHash('sha256').update(value).digest('hex');
const jsonLines = rows =>
  `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;

function completeList(pages, key) {
  const rows = pages.flatMap(page => page[key]);
  if (
    !pages.length ||
    pages.some(page => page.total_count !== rows.length) ||
    new Set(rows.map(row => row.id)).size !== rows.length
  )
    throw new Error(`Incomplete or duplicate ${key} enumeration`);
  return rows;
}

export function selectAuthenticatedWindow(inventory, cutoff) {
  return inventory
    .filter(row => {
      const job = row.measurement;
      return (
        row.status === 'completed' &&
        row.updatedAt <= cutoff &&
        job?.status === 'completed' &&
        job.completedAt <= cutoff &&
        job.stepStatus === 'completed' &&
        job.stepConclusion &&
        job.stepConclusion !== 'skipped'
      );
    })
    .sort(
      (a, b) =>
        b.measurement.completedAt.localeCompare(a.measurement.completedAt) ||
        b.controllerRunId - a.controllerRunId
    )
    .slice(0, 14);
}

// Native guard PASS includes every timing/resource budget and confirmation.
// A green enclosing step/controller (including alias-only work) is not proof.
export function parseAuthenticatedMeasurement(log) {
  const clean = log
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/^\uFEFF?\d{4}-\d{2}-\d{2}T\S+ /gm, '');
  const summary = clean.match(
    /(?:^|\n)Performance budgets: (PASS|FAIL)\n([\s\S]*?)(?=\nChecking |\nPerformance budgets: |$)/
  );
  const measuredRouteIds = [
    ...(summary?.[2] ?? '').matchAll(/^(creator-\S+) \(.+\) primary=/gm),
  ]
    .map(match => match[1])
    .sort();
  const routeSamplesMs = {};
  let current;
  let invalid = false;
  for (const line of clean.split('\n')) {
    const checking = line.match(/^Checking (\S+) -> /);
    if (checking) {
      current = checking[1];
      if (AUTHENTICATED_ROUTES.includes(current)) {
        if (routeSamplesMs[current]) invalid = true;
        routeSamplesMs[current] = [];
      }
    }
    const sample = line.match(/^\s+sample (\d+)\/(\d+): ([\d.]+)ms/);
    if (sample && routeSamplesMs[current]) {
      if (+sample[1] !== routeSamplesMs[current].length + 1 || +sample[2] !== 3)
        invalid = true;
      routeSamplesMs[current].push(+sample[3]);
    }
  }
  const valid =
    !invalid &&
    JSON.stringify(measuredRouteIds) === JSON.stringify(AUTHENTICATED_ROUTES) &&
    AUTHENTICATED_ROUTES.every(
      route =>
        routeSamplesMs[route]?.length === 3 &&
        routeSamplesMs[route].every(
          value => Number.isFinite(value) && value >= 0
        )
    );
  return {
    nativeStatus: summary?.[1]?.toLowerCase() ?? 'missing',
    measuredRouteIds,
    routeSamplesMs,
    valid,
    qualifies: valid && summary?.[1] === 'PASS',
  };
}

export function authenticatedDecision(measurements) {
  const miss = measurements.findIndex(row => !row.qualifies);
  const streak = miss < 0 ? measurements.length : miss;
  return {
    qualifyingRunsInWindow: measurements.filter(row => row.qualifies).length,
    consecutiveQualifyingRuns: streak,
    graduated: streak === 14,
    decision: streak === 14 ? 'block' : 'warn',
  };
}

async function ghRequest(path, json = true) {
  const { runGh } = await import('../../packages/api-client/gh.ts');
  const result = await runGh([
    'api',
    path,
    '--paginate',
    ...(json ? ['--slurp'] : []),
  ]);
  if (result.code !== 0)
    throw new Error(
      `GitHub evidence unavailable: ${path} (exit ${result.code})`
    );
  return json ? JSON.parse(result.stdout) : result.stdout;
}

export async function collectAuthenticatedGraduation({
  since,
  cutoff,
  nextReviewAt,
  request = ghRequest,
}) {
  if (
    ![since, cutoff, nextReviewAt].every(
      value =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
        Number.isFinite(Date.parse(value))
    ) ||
    since >= cutoff ||
    nextReviewAt <= cutoff ||
    Date.parse(nextReviewAt) - Date.parse(cutoff) > 7 * 86400_000
  )
    throw new Error('Expected UTC window and review within seven days');
  const base = `repos/${REPOSITORY}/actions`;
  const runs = completeList(
    await request(
      `${base}/workflows/${WORKFLOW}/runs?per_page=100&created=${since}..${cutoff}`
    ),
    'workflow_runs'
  );
  const inventory = [];
  for (const run of runs) {
    if (
      run.path !== `.github/workflows/${WORKFLOW}` ||
      run.created_at < since ||
      run.created_at > cutoff
    )
      throw new Error('Controller outside requested workflow/window');
    const jobs = completeList(
      await request(
        `${base}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
      ),
      'jobs'
    );
    const matches = jobs.filter(job => job.name === JOB);
    if (matches.length > 1) throw new Error('Duplicate measurement job');
    const job = matches[0];
    const step = job?.steps?.find(item => item.name === STEP);
    inventory.push({
      controllerRunId: run.id,
      runAttempt: run.run_attempt,
      headSha: run.head_sha,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      status: run.status,
      conclusion: run.conclusion,
      enumeratedJobCount: jobs.length,
      measurement: job
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
        : null,
    });
  }
  inventory.sort((a, b) => b.controllerRunId - a.controllerRunId);
  const measurements = [];
  for (const run of selectAuthenticatedWindow(inventory, cutoff)) {
    const job = run.measurement;
    const rawLog = await request(`${base}/jobs/${job.jobId}/logs`, false);
    const log = rawLog
      .split('\n')
      .filter(line => {
        const time = Date.parse(line.replace(/^\uFEFF/, '').match(/^\S+/)?.[0]);
        return (
          time >= Date.parse(job.stepStartedAt) &&
          time < Date.parse(job.stepCompletedAt) + 1000
        );
      })
      .join('\n');
    const testedSha = rawLog.match(
      /git log -1 --format=%H\r?\n\S+ ([0-9a-f]{40})/i
    )?.[1];
    const expectedSha = log.match(/EXPECTED_COMMIT_SHA: ([0-9a-f]{40})/)?.[1];
    const staged = rawLog.match(
      /Staged production deployment: (dpl_\w+) \((https:\/\/jovie-[\w-]+-jovie\.vercel\.app)\)/
    );
    const parsed = parseAuthenticatedMeasurement(log);
    const valid =
      parsed.valid && Boolean(testedSha && testedSha === expectedSha && staged);
    measurements.push({
      controllerRunId: run.controllerRunId,
      runAttempt: run.runAttempt,
      headSha: run.headSha,
      ...job,
      testedSha: testedSha ?? null,
      stagedDeployment: staged
        ? { id: staged[1], url: staged[2], expectedSha: expectedSha ?? null }
        : null,
      jobUrl: `https://github.com/${REPOSITORY}/actions/runs/${run.controllerRunId}/job/${job.jobId}`,
      logSha256: digest(rawLog),
      ...parsed,
      valid,
      qualifies: valid && parsed.qualifies,
    });
  }
  const inventoryText = jsonLines(inventory);
  const measurementsText = jsonLines(measurements);
  return {
    receipt: {
      schema: SCHEMA,
      repository: REPOSITORY,
      surface: 'production-release-exact-staged-build',
      measuredAt: cutoff,
      routeIds: AUTHENTICATED_ROUTES,
      selection: {
        workflowPath: `.github/workflows/${WORKFLOW}`,
        job: JOB,
        step: STEP,
        since,
        cutoff,
        enumeratedControllers: inventory.length,
        windowSize: 14,
        eligibility:
          'latest completed executed measurement steps regardless of controller conclusion; missing/partial authenticated results are nonqualifying; skipped steps never qualify',
        order:
          'measurement job completedAt descending, controllerRunId descending',
      },
      policy: {
        requiredConsecutiveRuns: 14,
        samplesPerRoute: 3,
        budgetAuthority: 'apps/web/scripts/performance-route-manifest.ts',
        nextReviewAt,
        trackingIssue: 'JOV-8557',
      },
      evidence: {
        inventory:
          'generated/authenticated-performance-controller-inventory.jsonl',
        inventorySha256: digest(inventoryText),
        measurements: 'generated/authenticated-performance-measurements.jsonl',
        measurementsSha256: digest(measurementsText),
      },
      window: {
        selectedJobIds: measurements.map(row => row.jobId),
        ...authenticatedDecision(measurements),
      },
    },
    inventoryText,
    measurementsText,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [since, cutoff, nextReviewAt] = process.argv.slice(2);
  const result = await collectAuthenticatedGraduation({
    since,
    cutoff,
    nextReviewAt,
  });
  mkdirSync(new URL('generated/', ROOT), { recursive: true });
  writeFileSync(
    new URL('authenticated-performance-graduation.json', ROOT),
    `${JSON.stringify(result.receipt, null, 2)}\n`
  );
  writeFileSync(
    new URL(result.receipt.evidence.inventory, ROOT),
    result.inventoryText
  );
  writeFileSync(
    new URL(result.receipt.evidence.measurements, ROOT),
    result.measurementsText
  );
}
