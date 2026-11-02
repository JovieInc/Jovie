import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_ROUTES,
  authenticatedDecision,
  collectAuthenticatedGraduation,
  parseAuthenticatedMeasurement,
  selectAuthenticatedWindow,
} from '../authenticated-performance-graduation.mjs';

const root = resolve(import.meta.dirname, '../../..');
const workflow =
  /** @type {{jobs: Record<string, {steps: Array<{id?: string, run?: string}>}>}} */ (
    load(
      readFileSync(
        join(root, '.github/workflows/production-release.yml'),
        'utf8'
      )
    )
  );
const step = workflow.jobs['promote-production'].steps.find(
  item => item.id === 'performance-gate'
);
const receipt = () =>
  JSON.parse(
    readFileSync(
      join(root, 'docs/performance/authenticated-performance-graduation.json'),
      'utf8'
    )
  );
const nativeLog = (status = 'PASS', routes = AUTHENTICATED_ROUTES) =>
  [
    ...routes.flatMap(route => [
      `Checking ${route} -> /fixture`,
      '  sample 1/3: 10.0ms',
      '  sample 2/3: 11.0ms',
      '  sample 3/3: 12.0ms',
    ]),
    `Performance budgets: ${status}`,
    ...routes.flatMap(route => [
      `${route} (/fixture) primary=interactive-shell-ready=11.0ms`,
      '  PASS interactive-shell-ready: 11.0ms / 100.0ms',
    ]),
  ].join('\n');

describe('authenticated six-route graduation', () => {
  it('requires the complete native authenticated result rather than a green enclosing step or alias result', () => {
    expect(parseAuthenticatedMeasurement(nativeLog())).toMatchObject({
      valid: true,
      qualifies: true,
    });
    for (const log of [
      '',
      'Performance budgets: PASS\npublic-profile-listen (/tim) primary=usable-alias-result=10ms',
      nativeLog('FAIL'),
      nativeLog('PASS', AUTHENTICATED_ROUTES.slice(1)),
      nativeLog().replace('sample 2/3: 11.0ms', 'sample 3/3: 11.0ms'),
      nativeLog().replace('sample 1/3: 10.0ms', 'sample 1/5: 10.0ms'),
    ])
      expect(parseAuthenticatedMeasurement(log).qualifies).toBe(false);
    expect(
      parseAuthenticatedMeasurement(
        `${nativeLog('FAIL')}\nChecking public-profile-listen -> /tim\nPerformance budgets: PASS`
      ).qualifies
    ).toBe(false);
  });

  it('needs fourteen consecutive complete results and retains failed controllers and partial measurements', () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      controllerRunId: 15 - index,
      status: 'completed',
      conclusion: 'failure',
      updatedAt: '2026-10-23T12:00:00Z',
      measurement: {
        jobId: index,
        status: 'completed',
        completedAt: `2026-10-23T11:${String(59 - index).padStart(2, '0')}:00Z`,
        stepStatus: 'completed',
        stepConclusion: 'failure',
      },
    }));
    rows[0].measurement.stepConclusion = 'skipped';
    const selected = selectAuthenticatedWindow(rows, '2026-10-23T13:00:00Z');
    expect(selected).toHaveLength(14);
    expect(selected[0].controllerRunId).toBe(14);
    expect(selectAuthenticatedWindow(rows, '2026-10-23T10:00:00Z')).toEqual([]);
    const green = Array.from({ length: 14 }, () => ({ qualifies: true }));
    expect(authenticatedDecision(green)).toMatchObject({
      graduated: true,
      decision: 'block',
    });
    expect(authenticatedDecision(green.slice(1)).graduated).toBe(false);
    green[1] = { qualifies: false };
    expect(authenticatedDecision(green)).toMatchObject({
      consecutiveQualifyingRuns: 1,
      qualifyingRunsInWindow: 13,
      decision: 'warn',
    });
  });

  it('reproduces the dated decision from its independent hashed inventory and measurements', () => {
    const data = receipt();
    const rows = {};
    for (const key of ['inventory', 'measurements']) {
      const text = readFileSync(
        join(root, 'docs/performance', data.evidence[key]),
        'utf8'
      );
      expect(createHash('sha256').update(text).digest('hex')).toBe(
        data.evidence[`${key}Sha256`]
      );
      rows[key] = text
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
    }
    expect(rows.inventory).toHaveLength(data.selection.enumeratedControllers);
    expect(data.window.selectedJobIds).toEqual(
      selectAuthenticatedWindow(rows.inventory, data.selection.cutoff).map(
        row => row.measurement.jobId
      )
    );
    expect(data.window.selectedJobIds).toEqual(
      rows.measurements.map(row => row.jobId)
    );
    expect(
      new Set(rows.measurements.map(row => row.controllerRunId)).size
    ).toBe(rows.measurements.length);
    for (const row of rows.measurements) {
      expect(row.logSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.jobUrl).toContain(
        `/actions/runs/${row.controllerRunId}/job/${row.jobId}`
      );
      expect(row.qualifies).toBe(row.valid && row.nativeStatus === 'pass');
      if (row.qualifies) {
        expect(row.measuredRouteIds).toEqual(AUTHENTICATED_ROUTES);
        expect(row.stagedDeployment.expectedSha).toBe(row.testedSha);
      }
    }
    expect(data.window).toMatchObject(authenticatedDecision(rows.measurements));
    expect(data.window).toMatchObject({
      graduated: true,
      consecutiveQualifyingRuns: 14,
      decision: 'block',
    });
    expect(rows.measurements).toHaveLength(14);
    expect(data.surface).toBe('production-release-exact-staged-build');
    expect(step.run).toContain('JOV-8557');
    expect(step.run).toContain(
      'docs/performance/authenticated-performance-graduation.json'
    );
  });

  it('fails collection on missing provider pages/logs and never counts an unexecuted step', async () => {
    const run = {
      id: 1,
      path: '.github/workflows/production-controller.yml',
      run_attempt: 1,
      created_at: '2026-10-23T10:00:00Z',
      updated_at: '2026-10-23T11:00:00Z',
      status: 'completed',
      head_sha: 'a'.repeat(40),
    };
    const options = {
      since: '2026-10-23T00:00:00Z',
      cutoff: '2026-10-23T12:00:00Z',
      nextReviewAt: '2026-10-28T12:00:00Z',
    };
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        request: async () => [{ total_count: 2, workflow_runs: [run] }],
      })
    ).rejects.toThrow(/Incomplete/);
    const request = async path =>
      path.includes('/workflows/')
        ? [{ total_count: 1, workflow_runs: [run] }]
        : [{ total_count: 0, jobs: [] }];
    const empty = await collectAuthenticatedGraduation({ ...options, request });
    expect(empty.receipt.window).toMatchObject({
      selectedJobIds: [],
      decision: 'warn',
      consecutiveQualifyingRuns: 0,
    });
    const job = {
      id: 2,
      name: options.job ?? 'Production Release / Promote to Production',
      status: 'completed',
      completed_at: run.updated_at,
      steps: [
        {
          name: 'Prove canonical navigation budgets on exact staged build',
          number: 13,
          status: 'completed',
          conclusion: 'failure',
          started_at: run.created_at,
          completed_at: run.updated_at,
        },
      ],
    };
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        request: async path => {
          if (path.endsWith('/logs')) throw new Error('log unavailable');
          return path.includes('/workflows/')
            ? request(path)
            : [{ total_count: 1, jobs: [job] }];
        },
      })
    ).rejects.toThrow('log unavailable');
  });

  it('binds native results to the exact tested deployment and rejects incomplete provider identity', async () => {
    const sha = 'a'.repeat(40);
    const options = {
      since: '2026-10-23T00:00:00Z',
      cutoff: '2026-10-23T12:00:00Z',
      nextReviewAt: '2026-10-28T12:00:00Z',
    };
    const run = {
      id: 1,
      run_attempt: 2,
      head_sha: 'b'.repeat(40),
      path: '.github/workflows/production-controller.yml',
      status: 'completed',
      conclusion: 'failure',
      created_at: '2026-10-23T09:00:00Z',
      updated_at: '2026-10-23T11:00:00Z',
    };
    const job = {
      id: 2,
      name: 'Production Release / Promote to Production',
      status: 'completed',
      conclusion: 'failure',
      completed_at: run.updated_at,
      steps: [
        {
          name: 'Prove canonical navigation budgets on exact staged build',
          number: 13,
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-10-23T10:00:00Z',
          completed_at: '2026-10-23T10:01:00Z',
        },
      ],
    };
    const log = [
      'git log -1 --format=%H',
      `2026-10-23T09:00:00Z ${sha}`,
      'Staged production deployment: dpl_fixture (https://jovie-fixture-jovie.vercel.app)',
      ...[`EXPECTED_COMMIT_SHA: ${sha}`, ...nativeLog().split('\n')].map(
        line => `2026-10-23T10:00:01Z ${line}`
      ),
    ].join('\n');
    const request =
      (rawLog = log, jobs = [job], count = jobs.length, controller = run) =>
      async path => {
        if (path.endsWith('/logs')) return rawLog;
        return path.includes('/workflows/')
          ? [{ total_count: 1, workflow_runs: [controller] }]
          : [{ total_count: count, jobs }];
      };
    const valid = await collectAuthenticatedGraduation({
      ...options,
      request: request(),
    });
    const measurement = JSON.parse(valid.measurementsText);
    expect(measurement).toMatchObject({
      qualifies: true,
      testedSha: sha,
      headSha: run.head_sha,
      runAttempt: 2,
    });
    expect(valid.receipt.window).toMatchObject({
      qualifyingRunsInWindow: 1,
      consecutiveQualifyingRuns: 1,
      graduated: false,
    });
    for (const invalidLog of [
      log.replace(
        `EXPECTED_COMMIT_SHA: ${sha}`,
        `EXPECTED_COMMIT_SHA: ${run.head_sha}`
      ),
      log.replace('Staged production deployment:', 'No deployment:'),
      log.replace('Performance budgets: PASS', 'Performance budgets: FAIL'),
    ]) {
      const result = await collectAuthenticatedGraduation({
        ...options,
        request: request(invalidLog),
      });
      expect(JSON.parse(result.measurementsText).qualifies).toBe(false);
    }
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        nextReviewAt: '2026-11-23T12:00:00Z',
        request: request(),
      })
    ).rejects.toThrow(/UTC window/);
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        request: request(log, [job], 2),
      })
    ).rejects.toThrow(/Incomplete/);
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        request: request(log, [job, { ...job, id: 3 }]),
      })
    ).rejects.toThrow(/Duplicate measurement/);
    await expect(
      collectAuthenticatedGraduation({
        ...options,
        request: request(log, [job], 1, {
          ...run,
          path: 'different-workflow.yml',
        }),
      })
    ).rejects.toThrow(/outside/);
  });

  it('executes the authenticated workflow branch and blocks promotion on budget or probe failure', () => {
    const temp = mkdtempSync(join(tmpdir(), 'jov-8557-'));
    try {
      const start = step.run.indexOf(
        'if ! CI=true pnpm exec tsx scripts/performance-budgets-guard.ts'
      );
      const end = step.run.indexOf('\n  fi', start) + 5;
      const branch = step.run.slice(start, end);
      const prefix = step.run.slice(
        0,
        step.run.indexOf('auth_performance_configured=false')
      );
      const invoke = guardExit => {
        writeFileSync(join(temp, 'output'), '');
        const result = spawnSync(
          'bash',
          [
            '-c',
            `${prefix}\ndeployment_url=https://fixture.invalid\nauth_state=/fixture\npnpm() { return ${guardExit}; }\n${branch}\necho promotion-reached`,
          ],
          {
            encoding: 'utf8',
            env: { ...process.env, GITHUB_OUTPUT: join(temp, 'output') },
          }
        );
        return {
          ...result,
          output: readFileSync(join(temp, 'output'), 'utf8'),
        };
      };
      for (const exit of [1, 2, 137]) {
        const result = invoke(exit);
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'failure_subtype=exact_build_performance_failed'
        );
        expect(result.stdout).toContain('::error::');
        expect(result.stdout).not.toContain('::warning::');
        expect(result.stdout).not.toContain('promotion-reached');
        expect(result.output).not.toContain(
          'authenticated_performance_status=warn'
        );
      }
      expect(invoke(0)).toMatchObject({
        status: 0,
        output: expect.stringContaining(
          'authenticated_performance_status=passed'
        ),
        stdout: expect.stringContaining('promotion-reached'),
      });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
