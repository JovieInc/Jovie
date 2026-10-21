import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STRUCTURAL_DEFAULT_CONCURRENCY,
  selectLanes,
} from '../../ci-fast-lanes.mjs';
import {
  ALIAS_ROUTES,
  aliasDecision,
  collectAliasGraduation,
  completeList,
  parseAliasSamples,
  selectAliasWindow,
} from '../public-profile-alias-graduation.mjs';
import {
  realGhVersion,
  resolveRealGh,
  runWithRealGh,
  storedZip,
} from '../real-gh-harness.mjs';
import { assertReviewDeadline } from '../review-deadline.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = /** @type {typeof import('node:child_process')} */ (
    await importOriginal()
  );
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
    spawnSync: vi.fn(actual.spawnSync),
  };
});

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const RELEASE_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-release.yml'),
  'utf8'
);
const CONTROLLER_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-controller.yml'),
  'utf8'
);
const PUBLIC_PROFILE_ALIAS_GRADUATION = JSON.parse(
  readFileSync(
    resolve(REPO_ROOT, 'docs/performance/public-profile-alias-graduation.json'),
    'utf8'
  )
);
const EXPECTED_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const DEPLOYMENT_ID = 'dpl_exact_generation';
const DEPLOYMENT_URL = 'https://jovie-exact-generation-jovie.vercel.app';
const tempRoots = [];

describe('public-profile alias graduation policy', () => {
  it('reproduces each independent window from the complete controller inventory', () => {
    const receipt = PUBLIC_PROFILE_ALIAS_GRADUATION;
    const { policy, selection, evidence, windows } = receipt;
    const readRows = path =>
      readFileSync(resolve(REPO_ROOT, 'docs/performance', path), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
    const inventory = readRows(evidence.inventory);
    const measurements = readRows(evidence.measurements);
    for (const key of ['inventory', 'measurements']) {
      expect(
        createHash('sha256')
          .update(
            readFileSync(resolve(REPO_ROOT, 'docs/performance', evidence[key]))
          )
          .digest('hex')
      ).toBe(evidence[`${key}Sha256`]);
    }
    expect(receipt.schema).toBe('jovie-public-profile-alias-graduation/v2');
    expect(inventory).toHaveLength(selection.enumeratedControllers);
    const originalWindow = selectAliasWindow(
      inventory,
      'production',
      '2026-10-14T15:21:25Z'
    );
    expect(originalWindow.map(row => row.production.jobId)).toEqual(
      expect.arrayContaining([115872079856, 115852914061, 115804204403])
    );
    expect(selection.windowSize).toBe(policy.requiredConsecutiveRuns);
    expect(policy.samplesPerRoute).toBe(5);
    expect(policy.p95Estimator).toBe('nearest-rank');
    for (const [surface, window] of Object.entries(windows)) {
      const selected = selectAliasWindow(inventory, surface, selection.cutoff);
      expect(window.selectedJobIds).toEqual(
        selected.map(row => row[surface].jobId)
      );
      const rows = measurements.filter(row => row.surface === window.surface);
      expect(rows.map(row => row.jobId)).toEqual(window.selectedJobIds);
      expect(rows).toHaveLength(14);
      expect(new Set(rows.map(row => row.controllerRunId)).size).toBe(14);
      for (const row of rows) {
        expect(row.valid).toBe(true);
        expect(row.headSha).toMatch(/^[0-9a-f]{40}$/);
        expect(row.testedSha).toMatch(/^[0-9a-f]{40}$/);
        if (surface === 'staging') {
          expect(row.stagedDeployment.expectedSha).toBe(row.testedSha);
          expect(row.stagedDeployment.url).toMatch(
            /^https:\/\/jovie-[a-z0-9-]+-jovie\.vercel\.app$/
          );
        }
        expect(row.logSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(row.jobUrl).toBe(
          `https://github.com/JovieInc/Jovie/actions/runs/${row.controllerRunId}/job/${row.jobId}`
        );
        for (const route of ALIAS_ROUTES) {
          expect(row.routeSamplesMs[route]).toHaveLength(5);
          expect(row.routeP95Ms[route]).toBe(
            Math.max(...row.routeSamplesMs[route])
          );
        }
        expect(row.observedP95Ms).toBe(
          Math.max(...Object.values(row.routeP95Ms))
        );
        expect(row.qualifies).toBe(row.observedP95Ms <= policy.thresholdMs);
      }
      expect(window).toMatchObject(aliasDecision(rows));
    }
    const measuredAt = Date.parse(receipt.measuredAt);
    const nextReviewAt = Date.parse(policy.nextReviewAt);
    expect(nextReviewAt).toBeGreaterThan(measuredAt);
    // A missed review warns for 72h (naming JOV-8338), then fails merge groups.
    assertReviewDeadline({
      label: 'public-profile alias graduation',
      deadline: policy.nextReviewAt,
      trackingIssue: policy.trackingIssue,
    });
    expect(nextReviewAt - measuredAt).toBeLessThanOrEqual(
      7 * 24 * 60 * 60 * 1000
    );
  });

  it('keeps staging independent and bounds the production warning', () => {
    const staging = getJobBlock(RELEASE_WORKFLOW, 'promote-production');
    const production = getJobBlock(
      RELEASE_WORKFLOW,
      'production-public-profile-alias-gate'
    );

    expect(staging).toContain('Staging policy is independent');
    const { policy, windows } = PUBLIC_PROFILE_ALIAS_GRADUATION;
    const review = policy.nextReviewAt.slice(0, 10);
    expect(staging).toContain(
      `Recheck by ${review} under ${policy.trackingIssue}`
    );
    expect(production).toContain(
      'docs/performance/public-profile-alias-graduation.json'
    );
    expect(production).toContain(
      `current streak of ${windows.production.consecutiveQualifyingRuns}/14`
    );
    expect(production).toContain(
      `no later than ${review} (${policy.trackingIssue})`
    );
    expect(production.includes('performance_status=warn')).toBe(
      !windows.production.graduated
    );
    expect(production).not.toContain('JOV-4854');
  });

  it('retains intervening failed controllers and partial measurements, skipping only unexecuted work', () => {
    const job = {
      status: 'completed',
      completedAt: '2026-10-20T01:00:00Z',
      stepStatus: 'completed',
      stepConclusion: 'success',
    };
    const inventory = Array.from({ length: 17 }, (_, index) => ({
      controllerRunId: index + 1,
      status: 'completed',
      conclusion: index % 2 ? 'failure' : 'success',
      updatedAt: job.completedAt,
      production: { ...job, jobId: index + 1 },
    }));
    inventory[16].production.stepConclusion = 'skipped';
    inventory[15].status = 'in_progress';
    inventory[14].production.stepConclusion = 'cancelled';
    const selected = selectAliasWindow(
      inventory,
      'production',
      '2026-10-21T01:00:00Z'
    );
    expect(selected.map(row => row.controllerRunId)).toEqual(
      Array.from({ length: 14 }, (_, index) => 15 - index)
    );
    expect(
      aliasDecision(
        selected.map(row => ({ qualifies: row.controllerRunId !== 15 }))
      )
    ).toMatchObject({ decision: 'warn', consecutiveQualifyingRuns: 0 });
    expect(
      selectAliasWindow(inventory, 'staging', '2026-10-21T01:00:00Z')
    ).toEqual([]);
    expect(
      selectAliasWindow(inventory, 'production', '2026-10-19T01:00:00Z')
    ).toEqual([]);
    expect(() =>
      completeList([{ total_count: 18, jobs: inventory }], 'jobs')
    ).toThrow('Incomplete');
    expect(() =>
      completeList([{ total_count: 2, jobs: [{ id: 1 }, { id: 1 }] }], 'jobs')
    ).toThrow('duplicate');
  });

  it('requires all 30 numbered samples and matching native maxima; 13 good runs cannot graduate', () => {
    const log = ALIAS_ROUTES.map(
      route =>
        `Checking ${route} -> /test\n${[1, 2, 3, 4, 5].map(index => `  sample ${index}/5: ${index === 5 ? 1500 : 700}ms`).join('\n')}\n${route} (/test) primary=usable-alias-result=700ms\n  PASS usable-alias-result-max: 1500.0ms / 1500.0ms`
    ).join('\n');
    const parsed = parseAliasSamples(log);
    expect(parsed).toMatchObject({
      valid: true,
      qualifies: true,
      observedP95Ms: 1500,
    });
    for (const broken of [
      log.replace('sample 3/5', 'sample 2/5'),
      log.replace('sample 5/5: 1500ms', 'sample 5/5: 1501ms'),
      log.replace('  sample 1/5: 700ms', ''),
      `${log}\n${log}`,
    ]) {
      expect(parseAliasSamples(broken)).toMatchObject({
        valid: false,
        qualifies: false,
      });
    }
    const miss = parseAliasSamples(
      log.replaceAll('1500ms', '1501ms').replaceAll('1500.0ms /', '1501.0ms /')
    );
    expect(miss).toMatchObject({
      valid: true,
      qualifies: false,
      observedP95Ms: 1501,
    });
    expect(aliasDecision(Array(13).fill(parsed)).graduated).toBe(false);
    expect(aliasDecision(Array(14).fill(parsed)).graduated).toBe(true);
  });

  it('collects paginated exact-attempt jobs without filtering failed controllers or borrowing staging samples', async () => {
    const at = '2026-10-20T01:00:00Z';
    const runs = Array.from({ length: 17 }, (_, index) => ({
      id: index + 1,
      run_attempt: 2,
      head_sha: EXPECTED_SHA,
      created_at: at,
      updated_at: at,
      status: 'completed',
      conclusion: 'failure',
      path: '.github/workflows/production-controller.yml',
    }));
    const request = vi.fn((path, json) => {
      if (path.includes('/workflows/'))
        return [runs.slice(0, 8), runs.slice(8)].map(workflow_runs => ({
          total_count: 17,
          workflow_runs,
        }));
      if (json === false)
        return [
          `${at} [command]/usr/bin/git log -1 --format=%H\n${at} ${EXPECTED_SHA}`,
          ...ALIAS_ROUTES.flatMap(route => [
            `${at} Checking ${route} -> /test`,
            ...[1, 2, 3, 4, 5].map(index => `${at}   sample ${index}/5: 700ms`),
            `${at} ${route} (/test) primary=usable-alias-result=700ms`,
            `${at}   PASS usable-alias-result-max: 700.0ms / 1500.0ms`,
          ]),
        ].join('\n');
      const id = +path.match(/runs\/(\d+)\/attempts\/2/)[1];
      return [
        {
          total_count: 1,
          jobs: [
            {
              id: id * 10,
              name: 'Production Release / Production public-profile alias usable-result gate',
              status: 'completed',
              conclusion: 'success',
              completed_at: at,
              steps: [
                {
                  name: 'Gate canonical public-profile aliases on usable results',
                  number: 5,
                  status: 'completed',
                  conclusion: 'success',
                  started_at: at,
                  completed_at: at,
                },
              ],
            },
          ],
        },
      ];
    });
    const options = {
      since: '2026-10-19T00:00:00Z',
      cutoff: '2026-10-21T00:00:00Z',
      nextReviewAt: '2026-10-28T00:00:00Z',
      trackingIssue: 'JOV-8338',
      request,
    };
    const { receipt, measurementsText } = await collectAliasGraduation(options);
    expect(receipt.windows.production).toMatchObject({
      graduated: true,
      consecutiveQualifyingRuns: 14,
      selectedJobIds: Array.from(
        { length: 14 },
        (_, index) => (17 - index) * 10
      ),
    });
    expect(receipt.windows.staging).toMatchObject({
      graduated: false,
      consecutiveQualifyingRuns: 0,
      selectedJobIds: [],
    });
    expect(measurementsText.trim().split('\n')).toHaveLength(14);
    expect(request.mock.calls[0][0]).not.toContain('status=success');
    await expect(
      collectAliasGraduation({ ...options, nextReviewAt: at })
    ).rejects.toThrow('bounded');
    await expect(
      collectAliasGraduation({ ...options, cutoff: 'invalid' })
    ).rejects.toThrow('UTC');
    await expect(
      collectAliasGraduation({
        ...options,
        request: () => [{ total_count: 18, workflow_runs: runs }],
      })
    ).rejects.toThrow('Incomplete');
  });

  it.each(['production', 'staging'])(
    'executes the %s guard with the measured enforcement decision',
    surface => {
      const staging = surface === 'staging';
      const job = getJobBlock(
        RELEASE_WORKFLOW,
        staging ? 'promote-production' : 'production-public-profile-alias-gate'
      );
      const script = getStepRunScript(
        job,
        staging
          ? 'Prove canonical navigation budgets on exact staged build'
          : 'Gate canonical public-profile aliases on usable results'
      );
      for (const exit of [0, 17]) {
        const fixture = makeFixture('alias-policy-');
        mkdirSync(join(fixture.root, 'apps/web'), { recursive: true });
        stubCommand(
          fixture.bin,
          'pnpm',
          '#!/bin/sh\nprintf "%s\\n" "$@" > "$ALIAS_GUARD_ARGUMENTS"\nexit "$ALIAS_GUARD_EXIT"\n'
        );
        const result = runScript(script, fixture, {
          ALIAS_GUARD_ARGUMENTS: join(fixture.root, 'arguments'),
          ALIAS_GUARD_EXIT: String(exit),
          DOPPLER_TOKEN: '',
          PLAYWRIGHT_VERCEL_BYPASS_SECRET: 'fixture-bypass',
          PRODUCTION_DEPLOYMENT_URL_B64:
            Buffer.from(DEPLOYMENT_URL).toString('base64'),
        });
        const decision =
          PUBLIC_PROFILE_ALIAS_GRADUATION.windows[surface].decision;
        expect(result.status).toBe(exit && decision === 'block' ? 1 : 0);
        const outputs = parseOutputs(fixture.output);
        if (!exit) expect(outputs.performance_status).toBe('passed');
        else if (staging)
          expect(outputs).toMatchObject({
            failure_subtype: 'exact_build_performance_failed',
          });
        else expect(outputs.performance_status).toBe('warn');
        const args = readFileSync(join(fixture.root, 'arguments'), 'utf8');
        expect(args).toContain(
          `--base-url\n${staging ? DEPLOYMENT_URL : 'https://jov.ie'}`
        );
        expect(args).toContain('--runs\n5');
        for (const route of ALIAS_ROUTES)
          expect(args).toContain(`--route-id\n${route}`);
      }
    }
  );
});

describe('production verification admission', () => {
  const job = getJobBlock(CONTROLLER_WORKFLOW, 'production-verified');
  const condition = job.match(/if: >-\s*\$\{\{([\s\S]*?)\}\}/)?.[1];
  if (!condition) throw new Error('Missing production verification condition');
  // Evaluate the actual workflow expression with GitHub's JSON and status
  // primitives so an empty skipped-job output cannot hide behind YAML parsing.
  const evaluate = new Function(
    'needs',
    'fromJSON',
    'always',
    `return (${condition.replace(/needs\.([\w-]+)/g, "needs['$1']")});`
  );
  const admission = (result, ci, authorized = 'success', verified = 'false') =>
    evaluate(
      {
        'release-source': { result, outputs: { ci } },
        'authorize-production': {
          result: authorized,
          outputs: { already_verified: verified },
        },
      },
      JSON.parse,
      () => true
    );

  it('skips verification safely when source resolution has no receipt', () => {
    for (const result of ['skipped', 'failure', 'cancelled']) {
      expect(admission(result, '', 'skipped')).toBe(false);
    }
    expect(admission('success', '')).toBe(false);
  });

  it('requires a push receipt and successful unverified authorization', () => {
    const push = JSON.stringify({ event: 'push' });
    expect(admission('success', push)).toBe(true);
    expect(
      admission('success', JSON.stringify({ event: 'pull_request' }))
    ).toBe(false);
    expect(admission('success', push, 'failure')).toBe(false);
    expect(admission('success', push, 'success', 'true')).toBe(false);
    expect(() => admission('success', '{malformed')).toThrow();
  });
});

afterEach(() => {
  vi.mocked(spawnSync).mockRestore();
  vi.mocked(spawn).mockRestore();
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  if (start < 0) throw new Error(`Missing workflow job: ${jobKey}`);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function getStepText(jobBlock, stepName) {
  const lines = jobBlock.split('\n');
  const stepStart = lines.findIndex(
    line => line === `      - name: ${stepName}`
  );
  if (stepStart < 0) throw new Error(`Missing workflow step: ${stepName}`);
  const stepEnd = lines.findIndex(
    (line, index) => index > stepStart && /^      - /.test(line)
  );
  return lines
    .slice(stepStart, stepEnd === -1 ? lines.length : stepEnd)
    .join('\n');
}

function getStepRunScript(jobBlock, stepName) {
  const stepLines = getStepText(jobBlock, stepName).split('\n');
  const runStart = stepLines.findIndex(line => line === '        run: |');
  if (runStart < 0) throw new Error(`Missing run block: ${stepName}`);
  return stepLines
    .slice(runStart + 1)
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
}

function materialize(script, values) {
  const rendered = script.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    if (key === 'inputs.release_mode') return 'production';
    if (!Object.hasOwn(values, key)) {
      throw new Error(`Missing workflow expression fixture: ${key}`);
    }
    return values[key];
  });
  if (rendered.includes('${{')) {
    throw new Error('Unresolved workflow expression in rendered script');
  }
  return rendered;
}

function makeFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  return { root, bin, output };
}

function stubCommand(bin, name, source) {
  const path = join(bin, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function stubGitMain(bin) {
  stubCommand(
    bin,
    'git',
    `#!/bin/sh
case "$*" in
  *ls-remote*)
    printf '%s\\trefs/heads/main\\n' "$STUB_MAIN_SHA"
    ;;
  *)
    echo "unexpected git: $*" >&2
    exit 2
    ;;
esac
`
  );
}

function parseOutputs(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function runScript(script, fixture, env = {}) {
  return spawnSync('bash', ['-c', script], {
    cwd: fixture.root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      ...env,
      GITHUB_OUTPUT: fixture.output,
      GITHUB_WORKSPACE: REPO_ROOT,
      PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
      RUNNER_TEMP: fixture.root,
    },
  });
}

function releaseExpressions(overrides = {}) {
  return {
    "needs.migrate-production.outputs.schema_drift == 'true'": 'false',
    'inputs.staging_verified': 'true',
    'needs.promote-production.outputs.failure_subtype': '',
    'needs.sentry-error-gate.outputs.gate_status': 'passed',
    'needs.production-oauth-gate.outputs.gate_status': 'passed',
    'needs.release-head.result': 'success',
    'needs.release-head.outputs.is_current': 'true',
    'needs.staging-head.result': 'success',
    'needs.staging-head.outputs.is_current': 'true',
    'needs.alias-staging.result': 'success',
    'needs.alias-staging.outputs.is_current': 'true',
    'needs.production-head.result': 'success',
    'needs.production-head.outputs.is_current': 'true',
    'needs.promote-production.result': 'success',
    'needs.sentry-error-gate.result': 'success',
    'needs.production-oauth-gate.result': 'success',
    'needs.rollback-production.result': 'skipped',
    'needs.rollback-production.outputs.rolled_back': '',
    'needs.staging-deployment-receipt.outputs.staging_refresh_outcome':
      'current_receipt',
    'needs.staging-deployment-receipt.outputs.deployed': 'true',
    'needs.staging-deployment-receipt.result': 'success',
    'needs.migrate-production.result': 'success',
    'needs.deploy-staging.result': 'success',
    'needs.attest-staging-build.result': 'success',
    'needs.canary-health-gate.result': 'success',
    'needs.production-public-profile-alias-gate.result': 'success',
    'github.repository': 'JovieInc/Jovie',
    ...overrides,
  };
}

function runReleaseResult(overrides = {}, boundarySha = NEWER_SHA, env = {}) {
  const fixture = makeFixture('release-result-');
  stubGitMain(fixture.bin);
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nif [ "${STUB_REST_DENIED:-0}" = 1 ]; then echo "API rate limit exceeded for installation" >&2; exit 1; fi\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  const script = materialize(
    getStepRunScript(
      getJobBlock(RELEASE_WORKFLOW, 'release-result'),
      'Resolve release result'
    ),
    releaseExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    EXPECTED_SHA,
    PROMOTION_SHA: EXPECTED_SHA,
    PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
    PRODUCTION_DEPLOYMENT_URL_B64:
      Buffer.from(DEPLOYMENT_URL).toString('base64'),
    PREVIOUS_PRODUCTION_DEPLOYMENT_ID: 'dpl_previous_generation',
    STUB_MAIN_SHA: boundarySha,
    RESOLVE_MAIN_RETRY_SECONDS: '0',
    ...env,
  });
  return { result, outputs: parseOutputs(fixture.output) };
}

function controllerVerifyExpressions(overrides = {}) {
  return {
    'needs.authorize-production.result': 'success',
    'needs.authorize-production.outputs.authorized': 'true',
    'needs.production-release.result': 'success',
    'needs.production-release.outputs.released': 'true',
    'needs.production-release.outputs.superseded_before_promotion': 'false',
    'needs.ci-public-profile-smoke.result': 'success',
    'needs.lighthouse-ci.result': 'success',
    'needs.ci-post-deploy-auth-smoke.result': 'success',
    'needs.ci-post-deploy-auth-smoke.outputs.auth_smoke_status': 'passed',
    'needs.ci-post-deploy-auth-smoke.outputs.credentials_configured': 'true',
    'github.repository': 'JovieInc/Jovie',
    ...overrides,
  };
}

function runControllerVerify(
  overrides = {},
  aliasStatus = 0,
  { doneSprintStatus = 0 } = {}
) {
  const fixture = makeFixture('controller-verify-');
  const aliasMarker = join(fixture.root, 'alias-called');
  const doneSprintMarker = join(fixture.root, 'done-sprint-called');
  stubGitMain(fixture.bin);
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  stubCommand(
    fixture.bin,
    'node',
    `#!/bin/sh
printf '%s\\n' "$*" > "$STUB_DONE_SPRINT_MARKER"
printf 'rescan=%s\\nurl=%s\\n' "$DONE_INVARIANT_RESCAN" "$DONE_INVARIANT_PRODUCTION_BASE_URL" >> "$STUB_DONE_SPRINT_MARKER"
exit "$STUB_DONE_SPRINT_STATUS"
`
  );
  const aliasScript = join(
    fixture.root,
    '.github/scripts/verify-production-alias.sh'
  );
  mkdirSync(dirname(aliasScript), { recursive: true });
  writeFileSync(
    aliasScript,
    '#!/bin/sh\nprintf "called\\n" > "$STUB_ALIAS_MARKER"\nexit "$STUB_ALIAS_STATUS"\n'
  );
  chmodSync(aliasScript, 0o755);
  const script = materialize(
    getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'production-verified'),
      'Require exact deployment and every post-deploy probe'
    ),
    controllerVerifyExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    EXPECTED_COMMIT_SHA: EXPECTED_SHA,
    EXPECTED_PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
    PRODUCTION_DEPLOYMENT_URL_B64:
      Buffer.from(DEPLOYMENT_URL).toString('base64'),
    STUB_ALIAS_MARKER: aliasMarker,
    STUB_ALIAS_STATUS: String(aliasStatus),
    STUB_DONE_SPRINT_MARKER: doneSprintMarker,
    STUB_DONE_SPRINT_STATUS: String(doneSprintStatus),
    STUB_MAIN_SHA: NEWER_SHA,
  });
  return {
    aliasCalled: existsSync(aliasMarker),
    doneSprintCalled: existsSync(doneSprintMarker)
      ? readFileSync(doneSprintMarker, 'utf8')
      : '',
    result,
    outputs: parseOutputs(fixture.output),
  };
}

function finalizeExpressions(overrides = {}) {
  return {
    'steps.verify.outcome': 'success',
    'steps.verify.outputs.canonical_verified': 'true',
    'steps.verify.outputs.canonical_deployment_id': DEPLOYMENT_ID,
    'steps.verify.outputs.canonical_sha': EXPECTED_SHA,
    'needs.authorize-production.outputs.authorized': 'true',
    'needs.production-release.result': 'success',
    'needs.ci-public-profile-smoke.result': 'success',
    'needs.ci-post-deploy-auth-smoke.result': 'success',
    'needs.lighthouse-ci.result': 'success',
    'needs.production-release.outputs.sentry_gate_status': 'passed',
    'needs.production-release.outputs.oauth_gate_status': 'passed',
    'github.repository': 'JovieInc/Jovie',
    'github.run_id': '1234',
    'github.run_attempt': '1',
    ...overrides,
  };
}

function runFinalize(overrides = {}, boundarySha = NEWER_SHA) {
  const fixture = makeFixture('controller-finalize-');
  const marker = join(fixture.root, 'production-generation-verified.json');
  mkdirSync(join(fixture.root, 'release-lineage'), { recursive: true });
  writeFileSync(
    join(fixture.root, 'release-lineage/fleet-admission.json'),
    JSON.stringify({ scopedAdmission: { revision: EXPECTED_SHA } })
  );
  writeFileSync(
    join(fixture.root, 'release-lineage/release-risk-receipt.json'),
    '{"latency":{"mergeAt":"2026-10-03T00:00:00Z","targetP95Seconds":1800},"ovie":{},"certificationPacket":null}'
  );
  stubGitMain(fixture.bin);
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  const script = materialize(
    getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'production-verified'),
      'Finalize exact current release generation'
    ),
    finalizeExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    AUTH_SMOKE_STATUS: 'passed',
    DEPLOYED_SHA: EXPECTED_SHA,
    DEPLOYMENT_ID,
    EXPECTED_SHA,
    RUN_WEB: 'true',
    SELECTED_LANES: 'web',
    STUB_MAIN_SHA: boundarySha,
    WEB_EVIDENCE_SHA: EXPECTED_SHA,
  });
  return {
    marker: existsSync(marker)
      ? JSON.parse(readFileSync(marker, 'utf8'))
      : null,
    result,
    outputs: parseOutputs(fixture.output),
  };
}

function runStagingStep(stepName, mainSha, env = {}) {
  const fixture = makeFixture('staging-refresh-');
  const aliasMarker = join(fixture.root, 'alias-called');
  const restMarker = join(fixture.root, 'rest-called');
  stubGitMain(fixture.bin);
  stubCommand(
    fixture.bin,
    'gh',
    `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_REST_MARKER"
if [ "\${STUB_MAIN_API_STATUS:-0}" != 0 ]; then
  echo 'gh: API rate limit exceeded for installation. (HTTP 403)' >&2
  exit "$STUB_MAIN_API_STATUS"
fi
printf '%s\\n' "$STUB_MAIN_SHA"
`
  );
  if (env.STUB_MAIN_GIT_STATUS) {
    stubCommand(
      fixture.bin,
      'git',
      '#!/bin/sh\nexit "$STUB_MAIN_GIT_STATUS"\n'
    );
  }
  const vercel = join(fixture.root, 'node_modules/.bin/vercel');
  mkdirSync(dirname(vercel), { recursive: true });
  writeFileSync(
    vercel,
    '#!/bin/sh\nprintf "%s\\n" "$*" > "$STUB_ALIAS_MARKER"\n'
  );
  chmodSync(vercel, 0o755);
  const script = materialize(
    getStepRunScript(
      getJobBlock(RELEASE_WORKFLOW, 'staging-deployment-receipt'),
      stepName
    ),
    {
      'github.repository': 'JovieInc/Jovie',
      'github.run_id': '1234',
      'github.run_attempt': '1',
    }
  );
  const result = runScript(script, fixture, {
    DEPLOYMENT_URL_B64: Buffer.from(DEPLOYMENT_URL).toString('base64'),
    EXPECTED_COMMIT_SHA: EXPECTED_SHA,
    EXPECTED_DEPLOYMENT_ID: DEPLOYMENT_ID,
    GH_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    PROMOTION_RESULT: 'success',
    PROMOTION_SHA: EXPECTED_SHA,
    ROLLBACK_RESULT: 'skipped',
    RESOLVE_MAIN_BUDGET_SECONDS: '0',
    RESOLVE_MAIN_RETRY_SECONDS: '0',
    SOURCE_CI_RUN_ATTEMPT: '1',
    SOURCE_CI_RUN_ID: '9876',
    SOURCE_CI_COMPLETED_AT: new Date(Date.now() - 1_000).toISOString(),
    STAGING_REFRESH_OUTCOME:
      mainSha === EXPECTED_SHA ? 'current' : 'superseded_after_mutation',
    STUB_ALIAS_MARKER: aliasMarker,
    STUB_REST_MARKER: restMarker,
    STUB_MAIN_SHA: mainSha,
    ...env,
  });
  return {
    aliasCalled: existsSync(aliasMarker),
    restCalled: existsSync(restMarker),
    receipt: existsSync(join(fixture.root, 'staging-deployment-receipt.json'))
      ? JSON.parse(
          readFileSync(
            join(fixture.root, 'staging-deployment-receipt.json'),
            'utf8'
          )
        )
      : null,
    receiptExists: existsSync(
      join(fixture.root, 'staging-deployment-receipt.json')
    ),
    result,
    outputs: parseOutputs(fixture.output),
  };
}

describe('production release supersession execution', () => {
  it('neutralizes an intentional pre-alias supersession only', () => {
    const neutral = runReleaseResult({
      'needs.staging-head.outputs.is_current': 'false',
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs).toMatchObject({
      released: 'false',
      superseded_before_promotion: 'true',
    });
  });

  it.each([
    ['main API', 'needs.release-head.result'],
    ['staging build', 'needs.deploy-staging.result'],
    ['staging attestation', 'needs.attest-staging-build.result'],
    ['staging canary', 'needs.canary-health-gate.result'],
  ])('handles a %s failure according to phase ownership', (_, failedKey) => {
    const overrides = { [failedKey]: 'failure' };
    const failed = runReleaseResult(overrides, NEWER_SHA);
    expect(failed.result.status === 0).toBe(
      failedKey !== 'needs.release-head.result'
    );
    expect(failed.outputs).toMatchObject({
      released: failedKey === 'needs.release-head.result' ? 'false' : 'true',
      superseded_before_promotion: 'false',
    });
  });

  it('preserves released=true for an exact promoted generation after main advances', () => {
    const released = runReleaseResult({}, NEWER_SHA);
    expect(released.result.status, released.result.stderr).toBe(0);
    expect(released.outputs).toMatchObject({
      released: 'true',
      superseded_before_promotion: 'false',
    });
  });

  it('preserves the exact release receipt through Git when REST is exhausted', () => {
    const released = runReleaseResult({}, NEWER_SHA, { STUB_REST_DENIED: '1' });
    expect(released.result.status, released.result.stderr).toBe(0);
    expect(released.outputs.released).toBe('true');
    expect(released.outputs.superseded_before_promotion).toBe('false');
  });

  it('keeps a proven pre-promotion supersession neutral after exact prior gates', () => {
    const neutral = runReleaseResult({}, NEWER_SHA, {
      PROMOTION_SHA: NEWER_SHA,
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs).toMatchObject({
      released: 'false',
      superseded_before_promotion: 'true',
    });
  });

  it('requires the external exact staging receipt', () => {
    const accepted = runReleaseResult();
    expect(accepted.result.status, accepted.result.stderr).toBe(0);
    expect(accepted.outputs.released).toBe('true');

    const incomplete = runReleaseResult({
      'inputs.staging_verified': 'false',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.outputs.released).toBe('false');
  });

  it('retains rollback and incomplete production evidence as failures', () => {
    const rollbackFailed = runReleaseResult({
      'needs.sentry-error-gate.outputs.gate_status': 'failed',
      'needs.rollback-production.result': 'failure',
    });
    expect(rollbackFailed.result.status).not.toBe(0);
    expect(rollbackFailed.outputs.released).toBe('false');

    const incomplete = runReleaseResult({
      'needs.production-oauth-gate.result': 'failure',
      'needs.production-oauth-gate.outputs.gate_status': 'error',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.outputs.released).toBe('false');
  });

  it('leaves a pre-promotion supersession unverified without canonical mutation', () => {
    const neutral = runControllerVerify({
      'needs.production-release.outputs.released': 'false',
      'needs.production-release.outputs.superseded_before_promotion': 'true',
      'needs.ci-public-profile-smoke.result': 'skipped',
      'needs.lighthouse-ci.result': 'skipped',
      'needs.ci-post-deploy-auth-smoke.result': 'skipped',
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs.canonical_verified).toBe('false');
    expect(neutral.aliasCalled).toBe(false);
    expect(neutral.doneSprintCalled).toBe('');

    const failure = runControllerVerify({
      'needs.production-release.outputs.released': 'false',
    });
    expect(failure.result.status).not.toBe(0);
    expect(failure.aliasCalled).toBe(false);
    expect(failure.doneSprintCalled).toBe('');
  });

  it('requires the real canonical bind before recording exact verification', () => {
    const verified = runControllerVerify({}, 0);
    expect(verified.result.status, verified.result.stderr).toBe(0);
    expect(verified.aliasCalled).toBe(true);
    expect(verified.doneSprintCalled).toContain(
      'scripts/invariants/done-sprint-invariants.mjs --release'
    );
    expect(verified.doneSprintCalled).toContain(`rescan=release`);
    expect(verified.doneSprintCalled).toContain(`url=${DEPLOYMENT_URL}`);
    expect(verified.outputs).toMatchObject({
      canonical_deployment_id: DEPLOYMENT_ID,
      canonical_sha: EXPECTED_SHA,
      canonical_verified: 'true',
    });

    const wrongCanonical = runControllerVerify({}, 17);
    expect(wrongCanonical.result.status).not.toBe(0);
    expect(wrongCanonical.aliasCalled).toBe(true);
    expect(wrongCanonical.doneSprintCalled).toBe('');
    expect(wrongCanonical.outputs.canonical_verified).toBe('false');
  });

  it('fails closed when the Done-sprint production rescan is red', () => {
    const blocked = runControllerVerify({}, 0, { doneSprintStatus: 1 });
    expect(blocked.result.status).not.toBe(0);
    expect(blocked.aliasCalled).toBe(true);
    expect(blocked.doneSprintCalled).toContain('rescan=release');
    expect(blocked.outputs.canonical_verified).toBe('false');
  });

  it('writes an older exact marker only after canonical and gate proof', () => {
    const superseded = runFinalize({}, NEWER_SHA);
    expect(superseded.result.status, superseded.result.stderr).toBe(0);
    expect(superseded.outputs.verified).toBe('true');
    expect(superseded.marker).toMatchObject({
      deploymentId: DEPLOYMENT_ID,
      fleetAdmission: { revision: EXPECTED_SHA },
      sha: EXPECTED_SHA,
      terminalReason: 'skipped_superseded',
    });
    expect(JSON.stringify(superseded.marker)).not.toContain(NEWER_SHA);

    const current = runFinalize({}, EXPECTED_SHA);
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.marker).toMatchObject({
      sha: EXPECTED_SHA,
      terminalReason: 'promoted',
    });
  });

  it('emits no marker for wrong canonical or incomplete production evidence', () => {
    const wrongCanonical = runFinalize({
      'steps.verify.outputs.canonical_sha': NEWER_SHA,
    });
    expect(wrongCanonical.result.status).not.toBe(0);
    expect(wrongCanonical.marker).toBeNull();

    const incomplete = runFinalize({
      'needs.production-release.outputs.sentry_gate_status': 'failed',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.marker).toBeNull();
  });

  it('records a mutation that finished before a newer generation took the lease', () => {
    const reassert = runStagingStep(
      'Classify staging generation after mutation',
      NEWER_SHA
    );
    expect(reassert.result.status, reassert.result.stderr).toBe(0);
    expect(reassert.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(reassert.aliasCalled).toBe(false);

    const receipt = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA
    );
    expect(receipt.result.status, receipt.result.stderr).toBe(0);
    expect(receipt.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(receipt.outputs.deployed).toBe('true');
    expect(receipt.receiptExists).toBe(true);
  });

  it.each([
    [EXPECTED_SHA, 'current'],
    [NEWER_SHA, 'superseded_after_mutation'],
  ])(
    'classifies %s without a REST read when the installation is rate-limited',
    (sha, outcome) => {
      for (const step of [
        'Classify staging generation after mutation',
        'Write typed staging deployment receipt',
      ]) {
        const staging = runStagingStep(step, sha, {
          STUB_MAIN_API_STATUS: '1',
        });
        expect(staging.result.status, staging.result.stderr).toBe(0);
        expect(staging.outputs.staging_refresh_outcome).toBe(outcome);
        expect(staging.restCalled).toBe(false);
        expect(staging.aliasCalled).toBe(false);
        if (step === 'Write typed staging deployment receipt') {
          expect(staging.outputs.deployed).toBe('true');
          expect(staging.receipt).toMatchObject({
            sha: EXPECTED_SHA,
            currentMainSha: sha,
            deploymentId: DEPLOYMENT_ID,
            state: outcome,
          });
        } else {
          expect(staging.receipt).toBeNull();
        }
      }
    }
  );

  it.each([
    ['unreadable main', NEWER_SHA, { STUB_MAIN_GIT_STATUS: '1' }],
    ['malformed main', 'not-a-sha', {}],
  ])(
    'fails staging receipt closed for %s when REST is rate-limited',
    (_, sha, env) => {
      for (const step of [
        'Classify staging generation after mutation',
        'Write typed staging deployment receipt',
      ]) {
        const staging = runStagingStep(step, sha, {
          STUB_MAIN_API_STATUS: '1',
          ...env,
        });
        expect(staging.result.status).toBe(1);
        expect(staging.outputs.staging_refresh_outcome).toBeUndefined();
        expect(staging.outputs.deployed).toBeUndefined();
        expect(staging.restCalled).toBe(true);
        expect(staging.aliasCalled).toBe(false);
        expect(staging.receipt).toBeNull();
      }
    }
  );

  it('ignores production state when classifying a staging generation', () => {
    const proof = { PROMOTION_SHA: NEWER_SHA };
    const reassert = runStagingStep(
      'Classify staging generation after mutation',
      NEWER_SHA,
      proof
    );
    expect(reassert.result.status, reassert.result.stderr).toBe(0);
    expect(reassert.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(reassert.outputs.deployed).toBeUndefined();
    expect(reassert.aliasCalled).toBe(false);
    expect(reassert.receiptExists).toBe(false);

    const receipt = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA,
      proof
    );
    expect(receipt.result.status, receipt.result.stderr).toBe(0);
    expect(receipt.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(receipt.outputs.deployed).toBe('true');
    expect(receipt.aliasCalled).toBe(false);
    expect(receipt.receiptExists).toBe(true);
  });

  it.each([
    ['malformed promotion SHA', { PROMOTION_SHA: 'not-a-sha' }],
    [
      'failed promotion result',
      { PROMOTION_SHA: NEWER_SHA, PROMOTION_RESULT: 'failure' },
    ],
    [
      'completed rollback',
      { PROMOTION_SHA: NEWER_SHA, ROLLBACK_RESULT: 'success' },
    ],
    [
      'post-promotion evidence with rollback',
      { PROMOTION_SHA: EXPECTED_SHA, ROLLBACK_RESULT: 'success' },
    ],
  ])('keeps staging classification independent of %s', (_, evidence) => {
    for (const stepName of [
      'Classify staging generation after mutation',
      'Write typed staging deployment receipt',
    ]) {
      const result = runStagingStep(stepName, NEWER_SHA, evidence);
      expect(result.result.status, result.result.stderr).toBe(0);
      expect(result.aliasCalled).toBe(false);
    }
  });

  it('keeps the normal staging receipt', () => {
    const current = runStagingStep(
      'Write typed staging deployment receipt',
      EXPECTED_SHA
    );
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.outputs).toMatchObject({
      deployed: 'true',
      deployment_id: DEPLOYMENT_ID,
      staging_refresh_outcome: 'current',
    });
    expect(current.receiptExists).toBe(true);
  });
});

describe('required structural release regression dispatch', () => {
  it.each([0, 23])('propagates operational exit %s', async exitCode => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    const commands = [];
    const target = 'production-release-supersession.test.mjs';
    vi.mocked(spawn).mockImplementation(command => {
      commands.push(command);
      // A minimal ChildProcess stand-in: only close/stdout/stderr are used.
      const child = /** @type {any} */ (new EventEmitter());
      child.stdout = child.stderr = new EventEmitter();
      const code = command.includes(target) ? exitCode : 0;
      setImmediate(() => child.emit('close', code));
      return child;
    });
    const lane = selectLanes('remaining').find(
      item => item.id === 'structural'
    );
    const result = await lane.run();
    const index = commands.findIndex(command => command.includes(target));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(commands[index]).toContain('pnpm exec vitest --root scripts');
    expect(result.code).toBe(exitCode);
    // Fail fast: only commands already in flight may follow the failure.
    if (exitCode) {
      expect(commands.length - 1 - index).toBeLessThan(
        STRUCTURAL_DEFAULT_CONCURRENCY
      );
    }
  });
});

describe('forward-only release lineage', () => {
  const RECHECK_STEPS = [
    ['release-head', 'Resolve current main HEAD'],
    ['staging-head', 'Resolve current main HEAD'],
    ['alias-staging', 'Recheck main immediately before staging alias'],
    ['production-head', 'Resolve current main HEAD'],
  ];

  const GIT_RECHECK_STEPS = [
    'Recheck main immediately before production mutation',
    'Recheck main immediately before production promotion',
  ];

  function stubLineageGh(bin) {
    stubCommand(
      bin,
      'gh',
      `#!/bin/sh
case "$*" in
  *rate_limit*)
    if [ -n "\${STUB_RATE_LIMIT_RESET:-}" ]; then
      printf '%s\\n' "$STUB_RATE_LIMIT_RESET"
      exit 0
    fi
    ;;
esac
case "$*" in
  *compare/*)
    if [ "\${STUB_COMPARE_FAILURES:-0}" -gt 0 ]; then
      echo "gh: API rate limit exceeded for installation." >&2
      exit 1
    fi
    printf '%s\\n' "$STUB_COMPARE_STATUS"
    ;;
  *)
    n=0
    [ -f "$STUB_MAIN_ATTEMPTS" ] && n="$(cat "$STUB_MAIN_ATTEMPTS")"
    n=$((n + 1))
    printf '%s' "$n" > "$STUB_MAIN_ATTEMPTS"
    if [ "$n" -le "$STUB_MAIN_FAILURES" ]; then
      echo "gh: API rate limit exceeded for installation." >&2
      exit 1
    fi
    printf '%s\\n' "$STUB_MAIN_SHA"
    ;;
esac
`
    );
  }

  function runRecheck(
    jobKey,
    stepName,
    mainSha,
    compareStatus,
    mainFailures = 0,
    extraEnv = {}
  ) {
    const fixture = makeFixture('lineage-recheck-');
    const attempts = join(fixture.root, 'main-attempts');
    stubLineageGh(fixture.bin);
    const script = materialize(
      getStepRunScript(getJobBlock(RELEASE_WORKFLOW, jobKey), stepName),
      { 'github.repository': 'JovieInc/Jovie' }
    );
    const result = runScript(script, fixture, {
      EXPECTED_SHA,
      EXPECTED_MAIN_SHA: EXPECTED_SHA,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      STUB_COMPARE_FAILURES: '0',
      STUB_COMPARE_STATUS: compareStatus,
      STUB_MAIN_ATTEMPTS: attempts,
      STUB_MAIN_FAILURES: String(mainFailures),
      STUB_MAIN_SHA: mainSha,
      ...extraEnv,
    });
    return {
      attempts: existsSync(attempts)
        ? Number(readFileSync(attempts, 'utf8'))
        : 0,
      result,
      outputs: parseOutputs(fixture.output),
    };
  }

  it.each(RECHECK_STEPS)(
    '%s "%s" proceeds for exact and ancestor SHAs and yields on divergence',
    (jobKey, stepName) => {
      const exact = runRecheck(jobKey, stepName, EXPECTED_SHA, 'identical');
      expect(exact.result.status, exact.result.stderr).toBe(0);
      expect(exact.outputs.is_current).toBe('true');

      const ancestor = runRecheck(jobKey, stepName, NEWER_SHA, 'ahead');
      expect(ancestor.result.status, ancestor.result.stderr).toBe(0);
      expect(ancestor.outputs.is_current).toBe('true');

      for (const status of ['diverged', 'behind', '']) {
        const off = runRecheck(jobKey, stepName, NEWER_SHA, status);
        expect(off.result.status, off.result.stderr).toBe(0);
        expect(off.outputs.is_current).toBe('false');
      }
    },
    30_000
  );

  function makeLineageRemote(mode) {
    const root = mkdtempSync(join(tmpdir(), 'lineage-remote-'));
    tempRoots.push(root);
    const src = join(root, 'src');
    mkdirSync(src);
    const git = args => {
      const result = spawnSync('git', args, {
        cwd: src,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Lineage',
          GIT_AUTHOR_EMAIL: 'lineage@example.com',
          GIT_COMMITTER_NAME: 'Lineage',
          GIT_COMMITTER_EMAIL: 'lineage@example.com',
        },
      });
      if (result.status !== 0) {
        throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
      }
      return result.stdout.trim();
    };
    git(['init', '-q', '-b', 'main']);
    writeFileSync(join(src, 'file'), 'base\n');
    git(['add', 'file']);
    git(['commit', '-qm', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    if (mode === 'ahead') {
      writeFileSync(join(src, 'file'), 'child\n');
      git(['commit', '-qam', 'child']);
    } else if (mode === 'diverged') {
      git(['checkout', '-q', '--orphan', 'rewritten']);
      writeFileSync(join(src, 'other'), 'other\n');
      git(['add', 'other']);
      git(['commit', '-qm', 'rewritten']);
      git(['branch', '-M', 'main']);
    }
    return { remote: src, base, tip: git(['rev-parse', 'HEAD']) };
  }

  function runRateLimitedAlias(
    mode,
    jobKey = 'alias-staging',
    stepName = 'Recheck main immediately before staging alias',
    extraEnv = {}
  ) {
    const remote = makeLineageRemote(mode);
    const expected = mode === 'exact' ? remote.tip : remote.base;
    return runRecheck(jobKey, stepName, remote.tip, 'identical', 9, {
      EXPECTED_SHA: expected,
      EXPECTED_MAIN_SHA: expected,
      MAIN_LINEAGE_REMOTE: remote.remote,
      STUB_COMPARE_FAILURES: '1',
      ...extraEnv,
    });
  }

  it.each(GIT_RECHECK_STEPS)(
    '%s proves lineage with git and does not call installation REST',
    stepName => {
      const step = getStepText(
        getJobBlock(RELEASE_WORKFLOW, 'promote-production'),
        stepName
      );
      expect(step).toContain('MAIN_LINEAGE_TRANSPORT: git');
      expect(step).not.toContain('GH_API_HOLD_BUDGET_SECONDS');
      expect(step).not.toContain('gh-api-hold.sh');

      for (const mode of ['exact', 'ahead', 'diverged']) {
        const remote = makeLineageRemote(mode);
        const expected = mode === 'exact' ? remote.tip : remote.base;
        const current = runRecheck(
          'promote-production',
          stepName,
          remote.tip,
          'identical',
          9,
          {
            EXPECTED_SHA: expected,
            EXPECTED_MAIN_SHA: expected,
            MAIN_LINEAGE_REMOTE: remote.remote,
            MAIN_LINEAGE_TRANSPORT: 'git',
            STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
          }
        );
        expect(current.result.status, current.result.stderr).toBe(0);
        expect(current.attempts).toBe(0);
        expect(current.result.stderr).not.toContain(
          'API rate limit exceeded for installation'
        );
        expect(current.outputs.is_current).toBe(String(mode !== 'diverged'));
        if (mode === 'diverged') {
          expect(current.outputs.superseded_sha).toBe(remote.tip);
        } else {
          expect(current.outputs.superseded_sha).toBeUndefined();
        }
      }
    }
  );

  it.each(GIT_RECHECK_STEPS)(
    '%s fails closed when git cannot prove lineage',
    stepName => {
      const current = runRecheck(
        'promote-production',
        stepName,
        EXPECTED_SHA,
        'identical',
        9,
        {
          MAIN_LINEAGE_TRANSPORT: 'git',
          MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
          STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
        }
      );
      expect(current.result.status).not.toBe(0);
      expect(current.attempts).toBe(0);
      expect(current.outputs.is_current).toBeUndefined();
      expect(current.outputs.superseded_sha).toBeUndefined();
      expect(current.result.stderr).not.toContain('is_current=true');
    }
  );

  it('rejects an unknown main-lineage transport', () => {
    const current = runRecheck(
      'promote-production',
      'Recheck main immediately before production mutation',
      EXPECTED_SHA,
      'identical',
      0,
      { MAIN_LINEAGE_TRANSPORT: 'skip' }
    );
    expect(current.result.status).not.toBe(0);
    expect(current.attempts).toBe(0);
    expect(current.outputs.is_current).toBeUndefined();
    expect(current.result.stderr).toContain(
      'MAIN_LINEAGE_TRANSPORT must be rest or git'
    );
  });

  it.each([
    ['exact', 'true'],
    ['ahead', 'true'],
    ['diverged', 'false'],
  ])(
    'rechecks %s staging main through git when the REST reset exceeds the job budget',
    (mode, isCurrent) => {
      const current = runRateLimitedAlias(
        mode,
        'staging-head',
        'Resolve current main HEAD',
        {
          GH_API_HOLD_BUDGET_SECONDS: '60',
          STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
        }
      );
      expect(current.result.status, current.result.stderr).toBe(0);
      expect(current.result.stderr).toContain('outside the 60s budget');
      expect(current.result.stderr).toContain('resolving main with git');
      expect(current.outputs.is_current).toBe(isCurrent);
    }
  );

  it('fails the staging recheck closed when both REST and git are unavailable', () => {
    const unavailable = runRecheck(
      'staging-head',
      'Resolve current main HEAD',
      EXPECTED_SHA,
      'identical',
      9,
      {
        GH_API_HOLD_BUDGET_SECONDS: '60',
        MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
        STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
      }
    );
    expect(unavailable.result.status).toBe(1);
    expect(unavailable.result.stderr).toContain('outside the 60s budget');
    expect(unavailable.result.stderr).toContain('git could not resolve main');
    expect(unavailable.outputs.is_current).toBeUndefined();
  });

  it('checks out both scripts needed by the staging lineage recheck', () => {
    const job = getJobBlock(RELEASE_WORKFLOW, 'staging-head');
    expect(job).toContain('ref: ${{ inputs.expected_sha }}');
    expect(job).toContain('persist-credentials: false');
    expect(job).toMatch(
      /sparse-checkout: \|\n\s+\.github\/scripts\/gh-api-hold\.sh\n\s+\.github\/scripts\/recheck-main-lineage\.sh/
    );
  });

  it('resolves an unchanged main through git when REST is rate limited', () => {
    const current = runRateLimitedAlias('exact');
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.attempts).toBe(2);
    expect(current.outputs.is_current).toBe('true');
  });

  it('keeps the staging alias when rate-limited REST still has an ancestor main', () => {
    const current = runRateLimitedAlias('ahead');
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.attempts).toBe(3);
    expect(current.outputs.is_current).toBe('true');
  });

  it('yields the staging alias when rate-limited REST shows main left the release', () => {
    const current = runRateLimitedAlias('diverged');
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.attempts).toBe(3);
    expect(current.outputs.is_current).toBe('false');
  });

  it('fails closed when the pre-alias main read stays unavailable', () => {
    const unavailable = runRecheck(
      'alias-staging',
      'Recheck main immediately before staging alias',
      EXPECTED_SHA,
      'identical',
      9,
      { MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote') }
    );
    expect(unavailable.result.status).toBe(1);
    expect(unavailable.attempts).toBe(2);
    expect(unavailable.outputs.is_current).toBeUndefined();
  });

  it('retries an installation 403 inside the budget and refuses a permission 403', () => {
    const fixture = makeFixture('lineage-hold-');
    const attempts = join(fixture.root, 'attempts');
    writeFileSync(attempts, '0');
    stubCommand(
      fixture.bin,
      'gh',
      `#!/bin/sh
case "$*" in
  *rate_limit*)
    date +%s
    exit 0
    ;;
esac
n="$(cat "$STUB_ATTEMPTS")"
n=$((n + 1))
printf '%s' "$n" > "$STUB_ATTEMPTS"
if [ "$n" -eq 1 ]; then
  echo "API rate limit exceeded for installation" >&2
  exit 1
fi
printf '%s\\n' "$STUB_MAIN_SHA"
`
    );
    const script = materialize(
      getStepRunScript(
        getJobBlock(RELEASE_WORKFLOW, 'alias-staging'),
        'Recheck main immediately before staging alias'
      ),
      { 'github.repository': 'JovieInc/Jovie' }
    );
    const held = runScript(script, fixture, {
      EXPECTED_SHA,
      GH_API_HOLD_BUDGET_SECONDS: '30',
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
      STUB_ATTEMPTS: attempts,
      STUB_MAIN_SHA: EXPECTED_SHA,
    });
    expect(held.status, held.stderr).toBe(0);
    expect(readFileSync(fixture.output, 'utf8')).toContain('is_current=true');
    expect(held.stderr).toContain('Holding');
    expect(Number(readFileSync(attempts, 'utf8'))).toBe(2);

    const deniedFixture = makeFixture('lineage-permission-');
    stubCommand(
      deniedFixture.bin,
      'gh',
      `#!/bin/sh
echo "gh: Resource not accessible by integration" >&2
exit 1
`
    );
    const denied = runScript(script, deniedFixture, {
      EXPECTED_SHA,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
    });
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).not.toMatch(/Holding /);
    expect(readFileSync(deniedFixture.output, 'utf8')).not.toContain(
      'is_current=true'
    );
  });

  function runPromote(mainSha, compareStatus, extraEnv = {}) {
    const fixture = makeFixture('lineage-promote-');
    stubLineageGh(fixture.bin);
    const promoted = join(fixture.root, 'promoted');
    const stagingAlias = join(fixture.root, 'staging-alias');
    const stagingRestore = join(fixture.root, 'staging-restore');
    writeFileSync(stagingAlias, 'dpl_staging_preview');
    const vercel = join(fixture.root, 'vercel');
    writeFileSync(
      vercel,
      `#!/bin/sh
case "$1" in
  inspect)
    id="$2"
    if [ "$2" = "jov.ie" ]; then
      if [ -f "$STUB_PROMOTED" ]; then id="$STUB_DEPLOY_ID"; else id="dpl_previous_generation"; fi
    elif [ "$2" = "staging.jov.ie" ]; then
      id="$(cat "$STUB_STAGING_ALIAS")"
    fi
    target="production"
    if [ "$id" = "dpl_staging_preview" ]; then target="preview"; fi
    printf '{"id":"%s","readyState":"READY","target":"%s","url":"https://jovie-%s-jovie.vercel.app"}\\n' "$id" "$target" "$id" ;;
  rolling-release) printf 'null\\n' ;;
  promote)
    printf '%s\\n' "$*" > "$STUB_PROMOTED"
    printf '%s' "$STUB_DEPLOY_ID" > "$STUB_STAGING_ALIAS" ;;
  alias)
    printf '%s\\n' "$*" > "$STUB_STAGING_RESTORE"
    printf '%s' 'dpl_staging_preview' > "$STUB_STAGING_ALIAS" ;;
esac
`
    );
    chmodSync(vercel, 0o755);
    const result = spawnSync(
      'bash',
      [resolve(REPO_ROOT, '.github/scripts/promote-production-deployment.sh')],
      {
        cwd: fixture.root,
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          EXPECTED_MAIN_SHA: EXPECTED_SHA,
          GH_TOKEN: 'stub',
          GITHUB_OUTPUT: fixture.output,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
          PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
          PRODUCTION_PROMOTION_POLL_SECONDS: '0',
          STUB_COMPARE_STATUS: compareStatus,
          STUB_DEPLOY_ID: DEPLOYMENT_ID,
          STUB_MAIN_SHA: mainSha,
          STUB_MAIN_ATTEMPTS: join(fixture.root, 'main-attempts'),
          STUB_MAIN_FAILURES: '0',
          STUB_PROMOTED: promoted,
          STUB_STAGING_ALIAS: stagingAlias,
          STUB_STAGING_RESTORE: stagingRestore,
          VERCEL_CLI: vercel,
          VERCEL_ORG_ID: 'team_stub',
          VERCEL_PROJECT_ID: 'prj_stub',
          VERCEL_TOKEN: 'stub',
          ...extraEnv,
        },
      }
    );
    return {
      promoted: existsSync(promoted),
      result,
      outputs: parseOutputs(fixture.output),
      stagingAlias: readFileSync(stagingAlias, 'utf8'),
      stagingRestored: existsSync(stagingRestore),
    };
  }

  it.each(['exact', 'ahead', 'diverged'])(
    'the promotion controller proves %s lineage after REST quota exhaustion',
    mode => {
      const remote = makeLineageRemote(mode);
      const expected = mode === 'exact' ? remote.tip : remote.base;
      const current = runPromote(remote.tip, 'identical', {
        EXPECTED_MAIN_SHA: expected,
        MAIN_LINEAGE_REMOTE: remote.remote,
        STUB_MAIN_FAILURES: '9',
        STUB_COMPARE_FAILURES: '1',
        STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
      });
      expect(current.result.status, current.result.stderr).toBe(0);
      expect(current.result.stderr).not.toContain(
        'API rate limit exceeded for installation'
      );
      expect(current.promoted).toBe(mode !== 'diverged');
      expect(current.outputs.promotion_sha).toBe(
        mode === 'diverged' ? remote.tip : expected
      );
      expect(current.outputs.is_current).toBeUndefined();
    }
  );

  it('refuses production mutation when REST and git cannot prove lineage', () => {
    const current = runPromote(EXPECTED_SHA, 'identical', {
      STUB_MAIN_FAILURES: '9',
      STUB_RATE_LIMIT_RESET: String(Math.floor(Date.now() / 1000) + 3600),
      MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
    });
    expect(current.result.status).not.toBe(0);
    expect(current.promoted).toBe(false);
    expect(current.outputs.promotion_sha).toBeUndefined();
    expect(current.outputs.failure_subtype).toBe(
      'production_promotion_state_invalid'
    );
    expect(current.outputs.is_current).toBeUndefined();
  });

  it('promotes an exact or ancestor generation and reports the promoted SHA', () => {
    for (const mode of ['exact', 'ahead']) {
      const remote = makeLineageRemote(mode);
      const expected = mode === 'exact' ? remote.tip : remote.base;
      const current = runPromote(remote.tip, 'identical', {
        EXPECTED_MAIN_SHA: expected,
        MAIN_LINEAGE_REMOTE: remote.remote,
      });
      expect(current.result.status, current.result.stderr).toBe(0);
      expect(current.promoted).toBe(true);
      expect(current.stagingAlias).toBe('dpl_staging_preview');
      expect(current.stagingRestored).toBe(true);
      expect(current.outputs.promotion_sha).toBe(expected);
    }
  });

  it('yields without mutation when the generation left main lineage', () => {
    const remote = makeLineageRemote('diverged');
    const diverged = runPromote(remote.tip, 'diverged', {
      EXPECTED_MAIN_SHA: remote.base,
      MAIN_LINEAGE_REMOTE: remote.remote,
    });
    expect(diverged.result.status, diverged.result.stderr).toBe(0);
    expect(diverged.promoted).toBe(false);
    expect(diverged.stagingAlias).toBe('dpl_staging_preview');
    expect(diverged.stagingRestored).toBe(false);
    expect(diverged.outputs.promotion_sha).toBe(remote.tip);
  });

  it.each(['exact', 'ahead', 'diverged'])(
    'proves %s lineage at the final mutation boundary when REST is exhausted',
    mode => {
      const remote = makeLineageRemote(mode);
      const expected = mode === 'exact' ? remote.tip : remote.base;
      const result = runPromote(remote.tip, 'ahead', {
        EXPECTED_MAIN_SHA: expected,
        MAIN_LINEAGE_REMOTE: remote.remote,
        STUB_COMPARE_FAILURES: '1',
        STUB_MAIN_FAILURES: '9',
      });
      expect(result.result.status, result.result.stderr).toBe(0);
      expect(result.promoted).toBe(mode !== 'diverged');
      expect(result.outputs.promotion_sha).toBe(
        mode === 'diverged' ? remote.tip : expected
      );
    }
  );

  it('refuses the final mutation when neither REST nor Git can prove lineage', () => {
    const result = runPromote(NEWER_SHA, 'ahead', {
      MAIN_LINEAGE_REMOTE: join(tmpdir(), 'missing-lineage-remote'),
      STUB_MAIN_FAILURES: '9',
    });
    expect(result.result.status).not.toBe(0);
    expect(result.promoted).toBe(false);
    expect(result.outputs.promotion_sha).toBeUndefined();
    expect(result.outputs.failure_subtype).toBe(
      'production_promotion_state_invalid'
    );
  });
});

describe('controller exact risk artifact discovery', () => {
  const runId = 37739744218;
  const attempt = 2;
  const artifactName = `ci-risk-classification-${runId}-${attempt}`;
  const risk = {
    schemaVersion: 1,
    riskLevel: 'high',
    requiresSmoke: true,
    requiresPreview: true,
    blocksUnattendedAutoMerge: true,
  };
  const run = {
    id: runId,
    run_attempt: attempt,
    run_started_at: '2026-10-08T06:40:00Z',
    path: '.github/workflows/ci.yml',
    head_sha: EXPECTED_SHA,
    event: 'merge_group',
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: 44,
    name: artifactName,
    archive_download_url:
      'http://github.localhost/repos/JovieInc/Jovie/actions/artifacts/44/zip',
    expired: false,
    workflow_run: { id: runId, head_sha: EXPECTED_SHA },
  };
  const unrelated = Array.from({ length: 43 }, (_, index) => ({
    ...artifact,
    id: index,
    name: `unrelated-${index}`,
  }));
  const script = getStepRunScript(
    getJobBlock(CONTROLLER_WORKFLOW, 'fleet-promotion'),
    'Resolve exact CI risk lane'
  );

  function discover(
    { runs = [run], artifacts = [...unrelated, artifact], direct = false } = {},
    candidate = script
  ) {
    const fixture = makeFixture('risk-discovery-');
    const data = join(fixture.root, 'fixture.json');
    const calls = join(fixture.root, 'calls.jsonl');
    writeFileSync(
      data,
      JSON.stringify({ runs, artifacts, risk, direct, runId, artifactName })
    );
    // Emulate the installed gh CLI's page boundary and incompatible flag rule.
    // jq is the real executable; run/head/attempt filtering is the actual shell.
    stubCommand(
      fixture.bin,
      'gh',
      `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
const f = JSON.parse(fs.readFileSync(process.env.RISK_FIXTURE, 'utf8'));
fs.appendFileSync(process.env.RISK_CALLS, JSON.stringify(args) + '\\n');
if (args.includes('--slurp') && args.includes('--jq')) process.exit(2);
if (args[0] === 'api') {
  const endpoint = args.find(a => a.startsWith('repos/'));
  if (endpoint.endsWith('/artifacts')) {
    const pages = [ { artifacts: f.artifacts.slice(0, 30) }, { artifacts: f.artifacts.slice(30) } ];
    const result = args.includes('--paginate') ? pages : args.includes('--slurp') ? [pages[0]] : pages[0];
    if (args.includes('--jq')) process.stdout.write(cp.execFileSync('jq', ['-r', args[args.indexOf('--jq') + 1]], { input: JSON.stringify(result), encoding: 'utf8' }));
    else process.stdout.write(JSON.stringify(result));
  } else {
    const query = args[args.indexOf('--jq') + 1];
    process.stdout.write(cp.execFileSync('jq', ['-r', query], { input: JSON.stringify({ workflow_runs: f.runs }), encoding: 'utf8' }));
  }
} else if (args[0] === 'run' && args[1] === 'download') {
  const name = args[args.indexOf('--name') + 1];
  if (!(f.direct && args[2] === '900') && !(args[2] === String(f.runId) && name === f.artifactName)) process.exit(1);
  const root = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(root + '/ci-risk-classification.json', JSON.stringify(f.risk));
} else process.exit(2);
`
    );
    const result = runScript(candidate, fixture, {
      REPO: 'JovieInc/Jovie',
      SOURCE_RUN_ID: '900',
      SOURCE_RUN_ATTEMPT: '1',
      SOURCE_SHA: EXPECTED_SHA,
      RISK_FIXTURE: data,
      RISK_CALLS: calls,
    });
    return {
      result,
      outputs: parseOutputs(fixture.output),
      calls: readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
      downloaded: existsSync(
        join(fixture.root, 'ci-risk/ci-risk-classification.json')
      )
        ? JSON.parse(
            readFileSync(
              join(fixture.root, 'ci-risk/ci-risk-classification.json'),
              'utf8'
            )
          )
        : null,
    };
  }

  const realGh = resolveRealGh();
  if (!realGh && process.env.CI)
    throw new Error('Risk discovery CI requires the real gh CLI.');

  it.skipIf(!realGh)(
    'follows a real gh Link header beyond the first 100 artifacts and downloads unchanged HIGH policy',
    async () => {
      const fixture = makeFixture('risk-real-gh-');
      const endpoint = `repos/JovieInc/Jovie/actions/runs/${runId}/artifacts`;
      const realUnrelated = Array.from({ length: 143 }, (_, id) => ({
        ...artifact,
        id,
        name: `unrelated-${id}`,
      }));
      const proof = await runWithRealGh({
        gh: realGh,
        script,
        env: {
          REPO: 'JovieInc/Jovie',
          SOURCE_RUN_ID: '900',
          SOURCE_RUN_ATTEMPT: '1',
          SOURCE_SHA: EXPECTED_SHA,
          GH_REPO: 'JovieInc/Jovie',
          RUNNER_TEMP: fixture.root,
          GITHUB_OUTPUT: fixture.output,
          GITHUB_WORKSPACE: REPO_ROOT,
        },
        route: path => {
          if (
            path.startsWith('repos/JovieInc/Jovie/actions/runs/900/artifacts')
          )
            return { body: { artifacts: [] } };
          if (path.startsWith('repos/JovieInc/Jovie/actions/runs?'))
            return { body: { workflow_runs: [run] } };
          if (path === `${endpoint}?per_page=100`)
            return {
              body: {
                total_count: 144,
                artifacts: realUnrelated.slice(0, 100),
              },
              headers: {
                link: `<http://github.localhost/${endpoint}?per_page=100&page=2>; rel="next"`,
              },
            };
          if (path === `${endpoint}?per_page=100&page=2`)
            return {
              body: {
                total_count: 144,
                artifacts: [...realUnrelated.slice(100), artifact],
              },
            };
          if (path === 'repos/JovieInc/Jovie/actions/artifacts/44/zip')
            return {
              body: storedZip({
                'ci-risk-classification.json': JSON.stringify(risk),
              }),
            };
          return null;
        },
      });
      expect(realGhVersion(realGh)).toMatch(/^gh version /);
      expect(proof.code, proof.stderr).toBe(0);
      expect(proof.requests, JSON.stringify(proof)).toContain(
        `GET ${endpoint}?per_page=100&page=2`
      );
      expect(
        parseOutputs(fixture.output).risk_lane,
        JSON.stringify(proof)
      ).toBe('high');
      expect(
        JSON.parse(
          readFileSync(
            join(fixture.root, 'ci-risk/ci-risk-classification.json'),
            'utf8'
          )
        )
      ).toEqual(risk);
    }
  );

  it.skipIf(!realGh)(
    'proves the actual gh parser rejects slurp combined with jq before any request',
    async () => {
      const proof = await runWithRealGh({
        gh: realGh,
        script:
          'gh api --paginate --slurp repos/JovieInc/Jovie/actions/runs/123/artifacts --jq ".artifacts"',
        route: () => {
          throw new Error('Unsupported flags must not reach the network');
        },
      });
      expect(proof.code).not.toBe(0);
      expect(proof.stderr).toContain('--jq');
      expect(proof.requests).toEqual([]);
    }
  );

  it('discovers the exact unexpired receipt beyond page one and retains HIGH-risk policy', () => {
    const proof = discover();
    expect(proof.result.status, proof.result.stderr).toBe(0);
    expect(proof.outputs.risk_lane).toBe('high');
    expect(proof.downloaded).toEqual(risk);
    expect(proof.calls.find(args => args.includes('--slurp'))).toEqual([
      'api',
      '--paginate',
      '--slurp',
      `repos/JovieInc/Jovie/actions/runs/${runId}/artifacts`,
    ]);
    const firstPageOnly = discover(
      {},
      script.replace(
        'bash "$GITHUB_WORKSPACE/.github/scripts/gh-api-hold.sh" api --paginate --slurp',
        'bash "$GITHUB_WORKSPACE/.github/scripts/gh-api-hold.sh" api --slurp'
      )
    );
    expect(firstPageOnly.result.status, firstPageOnly.result.stderr).toBe(0);
    expect(firstPageOnly.outputs.risk_lane).toBe('unknown');
  });

  it('keeps the existing direct exact-run download', () => {
    const proof = discover({ direct: true });
    expect(proof.result.status, proof.result.stderr).toBe(0);
    expect(proof.outputs.risk_lane).toBe('high');
    expect(proof.calls).toHaveLength(1);
    expect(proof.downloaded).toEqual(risk);
  });

  it.each([
    ['absent', []],
    ['expired', [{ ...artifact, expired: true }]],
    [
      'stale attempt',
      [{ ...artifact, name: `ci-risk-classification-${runId}-1` }],
    ],
    [
      'future attempt',
      [{ ...artifact, name: `ci-risk-classification-${runId}-99` }],
    ],
    ['prefix lookalike', [{ ...artifact, name: `${artifactName}-copy` }]],
    [
      'wrong run',
      [
        {
          ...artifact,
          workflow_run: { ...artifact.workflow_run, id: runId + 1 },
        },
      ],
    ],
    [
      'wrong head',
      [
        {
          ...artifact,
          workflow_run: { ...artifact.workflow_run, head_sha: NEWER_SHA },
        },
      ],
    ],
    ['missing lineage', [{ ...artifact, workflow_run: null }]],
    ['ambiguous', [artifact, { ...artifact, id: 45 }]],
  ])('fails closed for %s risk artifacts', (_, artifacts) => {
    const proof = discover({ artifacts });
    expect(proof.result.status, proof.result.stderr).toBe(0);
    expect(proof.outputs.risk_lane).toBe('unknown');
    expect(proof.downloaded).toBeNull();
  });

  it.each([
    ['wrong head', { head_sha: NEWER_SHA }],
    ['wrong workflow', { path: '.github/workflows/not-ci.yml' }],
    ['wrong event', { event: 'push' }],
    ['failed', { conclusion: 'failure' }],
    ['unfinished', { status: 'in_progress' }],
    ['invalid attempt', { run_attempt: 0 }],
  ])('does not consume a %s proof run', (_, fields) => {
    const proof = discover({ runs: [{ ...run, ...fields }] });
    expect(proof.result.status, proof.result.stderr).toBe(0);
    expect(proof.outputs.risk_lane).toBe('unknown');
    expect(proof.downloaded).toBeNull();
  });

  it('does not prefer an old higher attempt over the current successful run', () => {
    const proof = discover({
      runs: [
        {
          ...run,
          id: 10,
          run_attempt: 99,
          run_started_at: '2026-10-01T06:00:00Z',
        },
        run,
      ],
    });
    expect(proof.result.status, proof.result.stderr).toBe(0);
    expect(proof.outputs.risk_lane).toBe('high');
    expect(proof.downloaded.requiresSmoke).toBe(true);
    expect(proof.downloaded.requiresPreview).toBe(true);
    expect(proof.downloaded.blocksUnattendedAutoMerge).toBe(true);
  });
});

describe('controller main read resilience', () => {
  function runCoalesce(mainFailures) {
    const fixture = makeFixture('coalesce-');
    const attempts = join(fixture.root, 'main-attempts');
    const restLog = join(fixture.root, 'rest-log');
    stubCommand(
      fixture.bin,
      'git',
      `#!/bin/sh
case "$*" in
  *ls-remote*)
    n=0
    [ -f "$STUB_MAIN_ATTEMPTS" ] && n="$(cat "$STUB_MAIN_ATTEMPTS")"
    n=$((n + 1))
    printf '%s' "$n" > "$STUB_MAIN_ATTEMPTS"
    if [ "$n" -le "$STUB_MAIN_FAILURES" ]; then
      echo "git ls-remote failed" >&2
      exit 1
    fi
    printf '%s\\trefs/heads/main\\n' "$STUB_MAIN_SHA"
    ;;
  *)
    echo "unexpected git: $*" >&2
    exit 2
    ;;
esac
`
    );
    stubCommand(
      fixture.bin,
      'gh',
      `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_REST_LOG"
echo "unexpected REST main read" >&2
exit 9
`
    );
    const script = getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'coalesce-production'),
      'Evaluate event-driven supersession'
    );
    const result = runScript(script, fixture, {
      EXPECTED_SHA,
      FIXED_WINDOW_SECONDS_REPLACED: '60',
      GITHUB_STEP_SUMMARY: join(fixture.root, 'step-summary'),
      PRODUCTION_STARVATION_SECONDS: '5400',
      REPOSITORY: 'JovieInc/Jovie',
      RESOLVE_MAIN_BUDGET_SECONDS: '5',
      RESOLVE_MAIN_RETRY_SECONDS: '0',
      STUB_MAIN_SHA: EXPECTED_SHA,
      STUB_MAIN_ATTEMPTS: attempts,
      STUB_MAIN_FAILURES: String(mainFailures),
      STUB_REST_LOG: restLog,
    });
    return {
      attempts: existsSync(attempts)
        ? Number(readFileSync(attempts, 'utf8'))
        : 0,
      rest: existsSync(restLog) ? readFileSync(restLog, 'utf8') : '',
      outputs: parseOutputs(fixture.output),
      result,
    };
  }

  it('resolves main with git and does not spend a REST read', () => {
    const run = runCoalesce(1);
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.attempts).toBe(2);
    expect(run.rest).toBe('');
    expect(run.outputs.is_current).toBe('true');
    expect(run.outputs.decision).toBe('proceed');
    expect(run.outputs.wait_seconds).toBe('0');
    expect(run.result.stderr).not.toContain('unexpected merge-queue read');
  });

  it('still fails closed when main stays unreadable', () => {
    const run = runCoalesce(9);
    expect(run.result.status).toBe(1);
    expect(run.attempts).toBe(3);
    expect(run.outputs.is_current).toBe('false');
    expect(run.result.stderr).toContain(
      'Could not resolve refs/heads/main for JovieInc/Jovie via git ls-remote.'
    );
  });

  it('holds a REST main read until reset and refuses one outside the budget', () => {
    const script = resolve(REPO_ROOT, '.github/scripts/resolve-main-sha.sh');
    const runResolve = (resetOffset, budget) => {
      const fixture = makeFixture('resolve-main-');
      const calls = join(fixture.root, 'gh-calls');
      const reset = Math.floor(Date.now() / 1000) + resetOffset;
      stubCommand(fixture.bin, 'git', '#!/bin/sh\nexit 1\n');
      stubCommand(
        fixture.bin,
        'gh',
        `#!/bin/sh
n=0
[ -f "$STUB_CALLS" ] && n="$(cat "$STUB_CALLS")"
n=$((n + 1))
printf '%s' "$n" > "$STUB_CALLS"
if [ "$n" -eq 1 ]; then
  printf 'HTTP/2 403\\r\\nx-ratelimit-remaining: 0\\r\\nx-ratelimit-reset: ${reset}\\r\\n\\r\\n{"message":"API rate limit exceeded for installation"}\\n'
  exit 1
fi
printf 'HTTP/2 200\\r\\n\\r\\n{"sha":"%s"}\\n' "$STUB_MAIN_SHA"
`
      );
      return spawnSync('bash', [script, 'JovieInc/Jovie'], {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          GH_TOKEN: 'test-token',
          PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
          RESOLVE_MAIN_BUDGET_SECONDS: String(budget),
          RESOLVE_MAIN_RETRY_SECONDS: '0',
          STUB_CALLS: calls,
          STUB_MAIN_SHA: EXPECTED_SHA,
        },
      });
    };

    const held = runResolve(1, 30);
    expect(held.status, held.stderr).toBe(0);
    expect(held.stdout.trim()).toBe(EXPECTED_SHA);
    expect(held.stderr).toContain('Holding');

    const refused = runResolve(10_000, 5);
    expect(refused.status).toBe(1);
    expect(refused.stdout.trim()).toBe('');
    expect(refused.stderr).toContain('outside the 5s budget');
  });
});

describe('controller starvation bound', () => {
  it.each([
    ['current_main_sha', 'echo "is_current=true"'],
    ['final_main_sha', '  {\n    echo "source_ci_run_id='],
  ])('fails authorization when %s ancestry cannot be read', (variable, end) => {
    const authorization = getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'authorize-production'),
      'Cross-prove exact successful push CI'
    );
    const start = authorization.indexOf(`${variable}="$(bash `);
    const finish = authorization.indexOf(end, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(finish).toBeGreaterThan(start);
    const fixture = makeFixture('authorization-lineage-');
    stubCommand(
      fixture.bin,
      'bash',
      `#!/bin/sh
case "$1" in
  *resolve-main-sha.sh) printf '%s\\n' '${NEWER_SHA}' ;;
  *release-lineage-gate.sh) printf 'decision=error\\n'; exit 1 ;;
  -c) exec /bin/bash \"$@\" ;;
  *) exit 2 ;;
esac
`
    );
    // Execute the actual workflow boundary, including its shell conditionals.
    // A failed child inside [ "$(...)" ... ] must not become a green yield.
    const result = runScript(
      `set -euo pipefail\n${authorization.slice(start, finish)}\necho mutation-authorized`,
      fixture,
      { EXPECTED_SHA, REPOSITORY: 'JovieInc/Jovie' }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('yielded');
    expect(result.stdout).not.toContain('mutation-authorized');
    expect(parseOutputs(fixture.output)).not.toHaveProperty(
      'is_current',
      'false'
    );
  });

  it('routes every post-coalesce main recheck through the lineage gate', () => {
    const coalesce = getJobBlock(CONTROLLER_WORKFLOW, 'coalesce-production');
    const authorize = getJobBlock(CONTROLLER_WORKFLOW, 'authorize-production');
    expect(coalesce).toContain("PRODUCTION_STARVATION_SECONDS: '5400'");
    expect(coalesce).toContain('.github/scripts/release-lineage-gate.sh');
    expect(coalesce).toContain('.github/scripts/resolve-main-sha.sh');
    expect(
      coalesce.match(/release-lineage-gate\.sh/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
    expect(authorize.match(/release-lineage-gate\.sh/g)?.length ?? 0).toBe(2);
    expect(coalesce).not.toContain(
      'if [ "$current_main_sha" != "$EXPECTED_SHA" ]; then\n            record_receipt "superseded"'
    );
  });
});
