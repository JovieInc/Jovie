import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import {
  planBillingHealthPublic,
  readBillingHealthResponse,
} from '../../billing-health-public-intake.mjs';
import { planBillingSyncIntake } from '../../billing-sync-intake.mjs';
import {
  docsDeploymentUrl,
  docsShaOnMain,
  planDocsDeploy,
} from '../../docs-deploy-intake.mjs';
import { decideLoginSignal } from '../remediation-signal.mjs';

const NOW = Date.parse('2026-10-02T00:00:00.000Z');

const MATRIX_SHA = 'a'.repeat(40);
const MATRIX_SOURCE = 'e2e-full-matrix.yml:firefox';
const MATRIX_RUN = 42;
const MATRIX_ATTEMPT = 2;
/** @typedef {Record<string, unknown>} MatrixJobFixture */
/** @typedef {Record<string, unknown>} MatrixRunFixture */
/** @typedef {{
 * jobs?: MatrixJobFixture[],
 * run?: MatrixRunFixture | ((read: number) => MatrixRunFixture),
 * page?: (number: number, jobs: MatrixJobFixture[]) => Response,
 * env?: Record<string, string>,
 * twice?: boolean,
 * }} MatrixIntakeOptions */
/** @typedef {{ name?: string, if?: string, uses?: string, run?: string }} WorkflowStep */
/** @typedef {{ jobs: Record<string, {
 * steps: WorkflowStep[], needs?: string[],
 * strategy?: {matrix: Record<string, unknown>},
 * }> }} WorkflowFixture */

/** @returns {MatrixRunFixture} */
const matrixRun = () => ({
  id: MATRIX_RUN,
  run_attempt: MATRIX_ATTEMPT,
  head_sha: MATRIX_SHA,
  path: '.github/workflows/e2e-full-matrix.yml',
  event: 'push',
  head_branch: 'main',
  repository: { full_name: 'JovieInc/Jovie' },
});
/** @returns {MatrixJobFixture[]} */
const matrixJobs = () =>
  [
    'Build standalone E2E server',
    ...['chromium', 'firefox'].flatMap(browser =>
      [1, 2, 3, 4].map(shard => `E2E (Chrome + Firefox) (${browser}, ${shard})`)
    ),
  ].map((name, i) => ({
    id: 100 + i,
    name,
    run_id: MATRIX_RUN,
    run_attempt: MATRIX_ATTEMPT,
    head_sha: MATRIX_SHA,
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-10-19T18:00:00Z',
  }));
let matrixDelivery = 0;

/**
 * Exercise the actual entrypoint and existing Linear guards, entirely intercepted.
 * Unknown fixture fields intentionally exercise malformed API payloads.
 * @param {MatrixIntakeOptions} [options]
 */
async function matrixIntake({
  jobs = matrixJobs(),
  run = matrixRun(),
  page,
  env = {},
  twice = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-login-matrix-'));
  const previous = join(dir, 'previous');
  const stateFile = join(dir, 'signal-state');
  writeFileSync(previous, 'red\n');
  writeFileSync(stateFile, 'red\n');
  let state = { id: 'backlog', name: 'Backlog', type: 'backlog' };
  const effects = [];
  const requests = [];
  let runReads = 0;
  const reply = data => new Response(JSON.stringify(data));
  const fetchImpl = vi.fn(async (url, init) => {
    requests.push(String(url));
    if (String(url).startsWith('https://api.github.com/')) {
      if (String(url).includes('/jobs?')) {
        const number = Number(new URL(url).searchParams.get('page'));
        return page
          ? page(number, jobs)
          : reply({ total_count: jobs.length, jobs });
      }
      return reply(typeof run === 'function' ? run(++runReads) : run);
    }
    expect(String(url)).toBe('https://api.linear.app/graphql');
    expect(init.headers.Authorization).toBe('lin_intercepted_matrix_fixture');
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('FindRemediationForGreen'))
      return reply({
        data: {
          team: {
            states: {
              nodes: [{ id: 'done', name: 'Done', type: 'completed' }],
            },
          },
          issues: {
            nodes: [
              {
                id: 'canonical-7559',
                identifier: 'JOV-7559',
                url: 'https://linear.app/jovie/issue/JOV-7559',
                title: 'P0: e2e-login-timeout is red (e2e-login-timeout)',
                description: `Source-workflow: ${MATRIX_SOURCE}`,
                state,
                labels: { nodes: [{ name: 'remediation:e2e-login-timeout' }] },
              },
            ],
          },
        },
      });
    if (query.includes('AddLinearIssueComment')) {
      effects.push({ type: 'comment', variables });
      return reply({
        data: { commentCreate: { success: true, comment: { id: 'comment' } } },
      });
    }
    if (query.includes('ResolveRemediation')) {
      effects.push({ type: 'close', variables });
      state = { id: 'done', name: 'Done', type: 'completed' };
      return reply({
        data: {
          issueUpdate: {
            success: true,
            issue: { id: 'canonical-7559', identifier: 'JOV-7559' },
          },
        },
      });
    }
    throw new Error(`unexpected intercepted query: ${query}`);
  });
  const values = {
    LINEAR_API_KEY: 'lin_intercepted_matrix_fixture',
    GITHUB_TOKEN: 'gh_intercepted_matrix_fixture',
    GITHUB_OUTPUT: join(dir, 'outputs'),
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_RUN_ID: String(MATRIX_RUN),
    GITHUB_RUN_ATTEMPT: String(MATRIX_ATTEMPT),
    GITHUB_SHA: MATRIX_SHA,
    REMEDIATION_MODE: 'login',
    REMEDIATION_SOURCE: MATRIX_SOURCE,
    REMEDIATION_CONCLUSION: 'success',
    REMEDIATION_INTAKE_DISABLED: '',
    REMEDIATION_RUN_URL: `https://github.com/JovieInc/Jovie/actions/runs/${MATRIX_RUN}`,
    REMEDIATION_PREVIOUS_FILE: previous,
    REMEDIATION_STATE_FILE: stateFile,
    REMEDIATION_GATE_STEADY_GREEN: '1',
    REMEDIATION_FAIL_OPEN: '',
    REMEDIATION_EVIDENCE_LOG: '',
    REMEDIATION_EVIDENCE_JSON: '',
    ...env,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  vi.stubGlobal('fetch', fetchImpl);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`unexpected intake exit:${code}`);
  });
  try {
    for (let i = 0; i < (twice ? 2 : 1); i += 1) {
      const entry = new URL(
        `../../remediation-signal-intake.mjs?matrix-delivery=${++matrixDelivery}`,
        import.meta.url
      );
      await import(entry.href);
    }
    return {
      effects,
      requests,
      state,
      signalState: readFileSync(stateFile, 'utf8').trim(),
      result: JSON.parse(log.mock.calls.at(-1)[0]),
    };
  } finally {
    log.mockRestore();
    exit.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('login matrix producer clearance', () => {
  it.each([
    'queued',
    'in_progress',
    'failure',
    'cancelled',
    'skipped',
    'timed_out',
    'unknown',
  ])(
    'keeps a previously red Backlog signal open with a %s sibling',
    async outcome => {
      const jobs = matrixJobs();
      Object.assign(jobs[6], {
        status: ['queued', 'in_progress'].includes(outcome)
          ? outcome
          : 'completed',
        conclusion: ['queued', 'in_progress'].includes(outcome)
          ? null
          : outcome,
      });
      const result = await matrixIntake({ jobs });
      expect(result.effects).toEqual([]);
      expect(result.state.name).toBe('Backlog');
      expect(result.signalState).toBe('red');
      expect(result.result.action).toBe('skip');
      expect(result.result.reason).toMatch(/^matrix_/);
    }
  );

  it('uses the real guarded adapter to close once on complete qualified success, then reads Done without another write', async () => {
    const result = await matrixIntake({ twice: true });
    expect(result.state.name).toBe('Done');
    expect(result.signalState).toBe('green');
    expect(result.effects.map(effect => effect.type)).toEqual([
      'comment',
      'close',
    ]);
    expect(result.result.results[0].action).toBe('already_closed');
    expect(result.requests).toContain(
      `https://api.github.com/repos/JovieInc/Jovie/actions/runs/${MATRIX_RUN}/attempts/${MATRIX_ATTEMPT}/jobs?per_page=100&page=1`
    );
  });

  it.each([
    'missing',
    'duplicate',
    'duplicate-id',
    'missing-id',
    'unknown-shard',
    'sha',
    'run',
    'attempt',
    'unfinished-build',
    'invalid-completion',
    'non-string-completion',
  ])('holds incomplete or mismatched required jobs: %s', async kind => {
    const jobs = matrixJobs();
    if (kind === 'missing') jobs.pop();
    if (kind === 'duplicate') jobs.push({ ...jobs[4], id: 999 });
    if (kind === 'duplicate-id') jobs[3].id = jobs[2].id;
    if (kind === 'missing-id') delete jobs[3].id;
    if (kind === 'unknown-shard')
      jobs[3].name = 'E2E (Chrome + Firefox) (firefox, 5)';
    if (kind === 'sha') jobs[3].head_sha = 'b'.repeat(40);
    if (kind === 'run') jobs[3].run_id = 43;
    if (kind === 'attempt') jobs[3].run_attempt = 1;
    if (kind === 'unfinished-build') jobs[0].completed_at = null;
    if (kind === 'invalid-completion') jobs[3].completed_at = 'unknown';
    if (kind === 'non-string-completion') jobs[3].completed_at = 1;
    const result = await matrixIntake({ jobs });
    expect(result.effects).toEqual([]);
    expect(result.result.action).toBe('skip');
  });

  it.each([
    'id',
    'run_attempt',
    'head_sha',
    'path',
    'event',
    'head_branch',
    'repository',
  ])('rejects wrong or replayed canonical run binding: %s', async key => {
    const run = matrixRun();
    run[key] = key === 'repository' ? { full_name: 'other/repo' } : 'wrong';
    expect((await matrixIntake({ run })).effects).toEqual([]);
  });

  it('fails closed on incomplete pagination and provider refusal', async () => {
    for (const page of [
      () =>
        new Response(JSON.stringify({ total_count: 10, jobs: matrixJobs() })),
      () => new Response('unavailable', { status: 403 }),
      () => new Response('{'),
      () => new Response('null'),
      () => new Response('[]'),
      () => new Response(JSON.stringify({ total_count: 9, jobs: null })),
      () =>
        new Response(JSON.stringify({ total_count: '9', jobs: matrixJobs() })),
      () =>
        new Response(
          JSON.stringify({ total_count: 101, jobs: Array(101).fill({}) })
        ),
      () =>
        new Response(JSON.stringify({ total_count: 9, jobs: matrixJobs() }), {
          headers: { link: '<https://api.github.com/jobs?page=2>; rel="next"' },
        }),
    ])
      expect((await matrixIntake({ page })).effects).toEqual([]);
  });

  it('holds if a newer attempt appears while the complete job catalog is being read', async () => {
    const result = await matrixIntake({
      run: read => ({
        ...matrixRun(),
        run_attempt: read === 1 ? MATRIX_ATTEMPT : MATRIX_ATTEMPT + 1,
      }),
    });
    expect(result.effects).toEqual([]);
    expect(result.signalState).toBe('red');
    expect(result.result.reason).toBe('matrix_run_changed');
  });

  it('rejects a changing denominator, replayed pages and a bounded but unfinished job listing', async () => {
    const noise = Array.from({ length: 100 }, (_, i) => ({
      id: 2000 + i,
      name: 'unrelated',
    }));
    for (const page of [
      number =>
        new Response(
          JSON.stringify({ total_count: number === 1 ? 101 : 102, jobs: noise })
        ),
      () => new Response(JSON.stringify({ total_count: 201, jobs: noise })),
      number =>
        new Response(
          JSON.stringify({
            total_count: 501,
            jobs: noise.map(job => ({ ...job, id: job.id + number * 1000 })),
          })
        ),
    ])
      expect((await matrixIntake({ page })).effects).toEqual([]);
  });

  it.each([
    { GITHUB_TOKEN: '' },
    { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_RUN_ID: 'not-an-id' },
    { GITHUB_RUN_ID: '99999999999999999999999' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_RUN_ATTEMPT: '99999999999999999999999' },
    { GITHUB_SHA: 'not-a-sha' },
    { REMEDIATION_SOURCE: 'e2e-full-matrix.yml:unknown' },
    {
      REMEDIATION_RUN_URL: 'https://github.com/JovieInc/Jovie/actions/runs/43',
    },
  ])(
    'holds invalid caller identity before any provider or Linear operation: %j',
    async env => {
      const result = await matrixIntake({ env });
      expect(result.effects).toEqual([]);
      expect(result.requests).toEqual([]);
      expect(result.result.action).toBe('skip');
    }
  );

  it('accepts the attempt-scoped API without an optional per-job attempt field and ignores the still-running notifier', async () => {
    const jobs = matrixJobs().map(({ run_attempt, ...job }) => job);
    jobs.push({
      id: 555,
      name: 'Notify Results',
      status: 'in_progress',
      conclusion: null,
    });
    expect(
      (await matrixIntake({ jobs })).effects.filter(
        effect => effect.type === 'close'
      )
    ).toHaveLength(1);
  });

  it('reads every page before accepting the complete required denominator', async () => {
    const jobs = [
      ...matrixJobs(),
      ...Array.from({ length: 92 }, (_, i) => ({
        id: 9000 + i,
        name: 'unrelated',
      })),
    ];
    const result = await matrixIntake({
      jobs,
      page: number =>
        new Response(
          JSON.stringify({
            total_count: jobs.length,
            jobs: jobs.slice((number - 1) * 100, number * 100),
          })
        ),
    });
    expect(result.requests.some(url => url.endsWith('page=2'))).toBe(true);
    expect(
      result.effects.filter(effect => effect.type === 'close')
    ).toHaveLength(1);
  });

  it('keeps a shard success without independently verified matrix evidence from clearing', () => {
    expect(
      decideLoginSignal({ conclusion: 'success', source: MATRIX_SOURCE }).action
    ).toBe('skip');
  });

  it('uses the maintained all-shard notification seam and preserves all browser/shard selectors', () => {
    const workflow = /** @type {WorkflowFixture} */ (
      load(
        readFileSync(
          new URL(
            '../../../.github/workflows/e2e-full-matrix.yml',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
    expect(workflow.jobs['e2e-full-matrix'].strategy.matrix).toEqual({
      browser: ['chromium', 'firefox'],
      shard: [1, 2, 3, 4],
    });
    const local = workflow.jobs['e2e-full-matrix'].steps.find(
      step => step.name === 'File login-timeout remediation'
    );
    expect(local.if).toContain("steps.e2e-matrix.outcome == 'failure'");
    expect(workflow.jobs.notify.needs).toEqual([
      'build-web',
      'e2e-full-matrix',
    ]);
    for (const step of workflow.jobs.notify.steps.filter(step =>
      step.uses?.startsWith('actions/')
    )) {
      expect(step.if).toContain("needs.e2e-full-matrix.result == 'success'");
    }
    const final = workflow.jobs.notify.steps.find(
      step => step.name === 'Clear only a complete login-timeout matrix'
    );
    expect(final.if).toContain("needs.e2e-full-matrix.result == 'success'");
    expect(final.run).toContain('node scripts/remediation-signal-intake.mjs');
    const success = workflow.jobs.notify.steps.find(
      step => step.name === 'Slack notification on success'
    );
    expect(success.if).toContain(
      "steps.matrix-remediation.outputs.login_matrix_qualified == 'true'"
    );
  });
});

describe('maintained remediation entrypoint modes', () => {
  it('keeps filtered diagnostics, auth-smoke skips and non-matrix monitor skips from clearing', async () => {
    for (const env of [
      { REMEDIATION_MODE: 'auth-smoke', REMEDIATION_JOB_RESULT: 'skipped' },
      { REMEDIATION_MODE: 'monitor', REMEDIATION_CONCLUSION: 'skipped' },
      {
        REMEDIATION_CONCLUSION: 'failure',
        REMEDIATION_EVIDENCE_JSON: '/does-not-exist',
      },
    ])
      expect((await matrixIntake({ env })).effects).toEqual([]);
  });

  it('honors the existing intake kill switch and rejects an unknown mode', async () => {
    await expect(
      matrixIntake({ env: { REMEDIATION_INTAKE_DISABLED: '1' } })
    ).rejects.toThrow('unexpected intake exit:0');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        matrixIntake({ env: { REMEDIATION_MODE: 'unknown' } })
      ).rejects.toThrow('unexpected intake exit:1');
    } finally {
      error.mockRestore();
    }
  });

  it('runs the real diagnostic CLI on structured evidence, corrupt JSON, and absent files without adapter auth', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-login-diagnostic-'));
    const report = join(dir, 'report.json');
    const log = join(dir, 'evidence.log');
    const entry = new URL(
      '../../remediation-signal-intake.mjs',
      import.meta.url
    );
    const detect = () =>
      execFileSync(
        process.execPath,
        [entry.pathname, '--detect-login', log, report],
        { encoding: 'utf8', env: { PATH: process.env.PATH } }
      ).trim();
    try {
      writeFileSync(
        report,
        JSON.stringify({
          suites: [
            {
              file: 'auth.setup.ts',
              specs: [
                {
                  title: 'authenticate',
                  tests: [{ results: [{ status: 'timedOut' }] }],
                },
              ],
            },
          ],
        })
      );
      expect(detect()).toBe('true');
      writeFileSync(report, '{');
      writeFileSync(log, 'page loaded');
      expect(detect()).toBe('false');
      rmSync(report);
      rmSync(log);
      expect(detect()).toBe('false');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('login timeout attribution', () => {
  it.each([
    '1) [chromium] › dashboard.spec.ts:10:1 › dashboard\nError: page.goto: Timeout 60000ms exceeded\n  47 [chromium] › auth-pages.spec.ts:20:1 › sign-in page',
    '1) [firefox] › resilience.spec.ts:300:1 › login retry\nError: page.goto: NS_BINDING_ABORTED\n  299 | await page.goto("/signin", { timeout: 60_000 });',
    '1) [chromium] › dashboard.spec.ts:10:1 › dashboard\nTest timeout of 90000ms exceeded\n2) [chromium] › signin.spec.ts:12:1 › sign-in\nError: expected heading',
  ])(
    'does not pair another operation or source snippet with signin: %s',
    text => {
      expect(
        decideLoginSignal({ conclusion: 'failure', evidenceText: text }).action
      ).toBe('skip');
    }
  );
  it('preserves actual authentication setup timeout evidence', () => {
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText:
          '1) [setup] › auth.setup.ts:4:1 › authenticate\nTest timeout of 90000ms exceeded',
      }).action
    ).toBe('red');
  });
});

describe('billing detector plans', () => {
  it('accepts the canonical public liveness response and authenticated detail', () => {
    expect(
      planBillingHealthPublic(200, {
        healthy: true,
        timestamp: new Date(NOW).toISOString(),
      }).action
    ).toBe('resolve');
    expect(planBillingHealthPublic(401).action).toBe('resolve');
    expect(planBillingHealthPublic(403).action).toBe('resolve');
    expect(planBillingHealthPublic(503).action).toBe('skip');
  });

  it('files actual anonymous detailed state, including unsuccessful health checks', () => {
    expect(
      planBillingHealthPublic(200, { metrics: { proUsersInDb: 42 } }).action
    ).toBe('upsert');
    expect(
      planBillingHealthPublic(503, {
        checks: { recentReconciliation: { status: 'critical' } },
      }).action
    ).toBe('upsert');
  });

  it('does not infer clean evidence from status alone or unknown response bodies', () => {
    for (const response of [
      undefined,
      null,
      [],
      {},
      { healthy: true },
      { healthy: true, timestamp: 'invalid' },
      {
        healthy: true,
        timestamp: new Date(NOW).toISOString(),
        extra: 'unknown',
      },
    ]) {
      expect(planBillingHealthPublic(200, response).action).toBe('skip');
    }
  });

  it('reads bounded JSON evidence and rejects missing, malformed, oversized and linked files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-billing-response-'));
    try {
      const path = join(dir, 'response.json');
      const body = { healthy: true, timestamp: new Date(NOW).toISOString() };
      expect(readBillingHealthResponse(path)).toBeUndefined();
      writeFileSync(path, JSON.stringify(body));
      expect(readBillingHealthResponse(path)).toEqual(body);
      symlinkSync(path, join(dir, 'link.json'));
      expect(readBillingHealthResponse(join(dir, 'link.json'))).toBeUndefined();
      writeFileSync(path, '{');
      expect(readBillingHealthResponse(path)).toBeUndefined();
      writeFileSync(path, ' '.repeat(32769));
      expect(readBillingHealthResponse(path)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a failed reconciliation open even when its receipt is fresh', () => {
    const receipt = {
      lastReconciliationAt: new Date(NOW - 60_000).toISOString(),
      lastReconciliationSuccess: false,
      now: NOW,
    };
    expect(planBillingSyncIntake(receipt)).toMatchObject({
      action: 'upsert',
      reconciliationFailed: true,
    });
    expect(
      planBillingSyncIntake({ ...receipt, lastReconciliationSuccess: true })
        .action
    ).toBe('resolve');
  });

  it('files reconciliation older than 36 hours or webhooks older than 2 hours', () => {
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 37 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: new Date(NOW - 121 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 35 * 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: new Date(NOW - 119 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('resolve');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: null,
        now: NOW,
      }).action
    ).toBe('resolve');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 0,
        now: NOW,
      }).action
    ).toBe('resolve');
  });
});

describe('docs deploy plan', () => {
  it('uses the latest deployment status URL before the payload fallback', () => {
    expect(
      docsDeploymentUrl(
        { payload: { web_url: 'https://jovie-docs.vercel.app' } },
        { environment_url: 'https://vercel.com/jovie/docs/deploy-123' }
      )
    ).toBe('https://vercel.com/jovie/docs/deploy-123');
    expect(
      docsDeploymentUrl(
        { payload: { web_url: 'https://jovie-docs.vercel.app' } },
        {}
      )
    ).toBe('https://jovie-docs.vercel.app/');
  });

  it('does not substitute API URLs or unsafe/malformed provider metadata', () => {
    expect(
      docsDeploymentUrl(
        { url: 'https://api.github.com/repos/JovieInc/Jovie/deployments/123' },
        {}
      )
    ).toBeUndefined();
    for (const url of [
      'https://api.github.com/repos/JovieInc/Jovie/deployments/123',
      'http://vercel.com/deploy/123',
      'https://secret@vercel.com/deploy/123',
      'invalid',
    ]) {
      expect(
        docsDeploymentUrl(
          { payload: { web_url: url } },
          { environment_url: url }
        )
      ).toBeUndefined();
    }
  });

  it('files a failed main deployment and resolves the next success', () => {
    expect(docsShaOnMain('ahead')).toBe(true);
    expect(docsShaOnMain('identical')).toBe(true);
    expect(docsShaOnMain('behind')).toBe(false);
    expect(planDocsDeploy({ status: 'error', onMain: true }).action).toBe(
      'upsert'
    );
    expect(planDocsDeploy({ status: 'failure', onMain: false }).action).toBe(
      'skip'
    );
    expect(planDocsDeploy({ status: 'success', onMain: true }).action).toBe(
      'resolve'
    );
  });
});
