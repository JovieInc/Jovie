import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import * as realGhHarness from '../../../../../scripts/lib/real-gh-harness.mjs';

// JOV-7707: staging alias ownership, the typed staging receipt and the
// production release result are proven by executing the shipped
// production-release.yml shell (stub vercel/node, real gh), not by matching
// its text. OAuth retry behavior is executed in deploy-workflow.test.ts and
// the staging identity/privacy proof in its "gates staging content identity"
// cases.

const { resolveRealGh, runWithRealGh } = realGhHarness as unknown as {
  resolveRealGh: () => string | null;
  runWithRealGh: (options: {
    script: string;
    env?: Record<string, string>;
    route: (path: string) => { status?: number; body: unknown } | null;
  }) => Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    requests: string[];
  }>;
};

type Step = {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = { needs?: string[]; if?: string; steps: Step[] };

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const release = parseYaml(
  readFileSync(
    resolve(repoRoot, '.github/workflows/production-release.yml'),
    'utf8'
  )
) as { jobs: Record<string, Job> };
const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7707: CI must provide the real gh binary.');
}
const SHA = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);
const DEPLOYMENT_ID = 'dpl_Exact123';
const DEPLOYMENT_URL = 'https://jovie-git-abc-jovie.vercel.app';
const NOW = Math.floor(Date.now() / 1000);
const b64 = (value: string) => Buffer.from(value).toString('base64');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function job(id: string) {
  const found = release.jobs[id];
  expect(found, id).toBeDefined();
  return found as Job;
}

function step(owner: Job, name: string) {
  const found = owner.steps.find(entry => entry.name === name);
  expect(found, name).toBeDefined();
  return found as Step;
}

function workspace(stubs: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-release-')));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  for (const [path, body] of Object.entries(stubs)) {
    const target = path.includes('/') ? join(root, path) : join(bin, path);
    writeFileSync(
      target,
      `#!/bin/bash\nprintf '%s\\n' "${path} $*" >> "${root}/calls.log"\n${body}\n`,
      { mode: 0o755 }
    );
  }
  const calls = () =>
    existsSync(join(root, 'calls.log'))
      ? readFileSync(join(root, 'calls.log'), 'utf8')
      : '';
  return { root, bin, calls };
}

const readOutputs = (path: string) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  ) as Record<string, string>;

// Renders ${{ }} the way Actions would for one scenario.
function render(
  script: string,
  context: {
    github?: { run_id: string; run_attempt: string };
    needs?: Record<
      string,
      { result?: string; outputs?: Record<string, string> }
    >;
    inputs?: Record<string, string>;
  }
) {
  return script.replace(
    /\$\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => {
      const comparison = expression.match(
        /^needs\.([\w-]+)\.outputs\.(\w+) == '(\w+)'$/
      );
      if (comparison?.[1] && comparison[2])
        return String(
          context.needs?.[comparison[1]]?.outputs?.[comparison[2]] ===
            comparison[3]
        );
      const result = expression.match(/^needs\.([\w-]+)\.result$/);
      if (result?.[1]) return context.needs?.[result[1]]?.result ?? 'success';
      const output = expression.match(/^needs\.([\w-]+)\.outputs\.(\w+)$/);
      if (output?.[1] && output[2])
        return context.needs?.[output[1]]?.outputs?.[output[2]] ?? '';
      const input = expression.match(/^inputs\.(\w+)$/);
      if (input?.[1]) return context.inputs?.[input[1]] ?? '';
      if (expression === 'github.repository') return 'JovieInc/Jovie';
      if (expression === 'github.run_id') return context.github?.run_id ?? '';
      if (expression === 'github.run_attempt')
        return context.github?.run_attempt ?? '';
      return '';
    }
  );
}

const mainRoute = (sha: string) => (path: string) =>
  path.startsWith('repos/JovieInc/Jovie/commits/main')
    ? { body: { sha } }
    : null;

describe('staging alias ownership (executed)', { timeout: 60_000 }, () => {
  const alias = job('alias-staging');

  it('aliases only after canary and a current-head recheck, then proves and probes', () => {
    expect(alias.needs).toEqual([
      'deploy-staging',
      'canary-health-gate',
      'staging-head',
    ]);
    for (const condition of [
      "needs.deploy-staging.result == 'success'",
      "needs.canary-health-gate.result == 'success'",
      "needs.staging-head.outputs.is_current == 'true'",
    ])
      expect(alias.if).toContain(condition);
    const names = alias.steps.map(entry => entry.name);
    const order = [
      'Recheck main immediately before staging alias',
      'Alias verified deployment',
      'Prove staging alias owns the SHA-attested exact deployment',
      'Verify aliased staging OAuth redirect URIs',
    ].map(name => names.indexOf(name));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The canary verifies the raw preview and never the shared alias.
    expect(
      readFileSync(
        resolve(repoRoot, '.github/workflows/canary-health-gate.yml'),
        'utf8'
      )
    ).not.toContain('staging.jov.ie');
  });

  it('points staging.jov.ie at the decoded exact deployment URL', () => {
    const { root, bin, calls } = workspace({
      'node_modules/.bin/vercel': 'exit 0',
    });
    const result = spawnSync(
      'bash',
      ['-c', String(step(alias, 'Alias verified deployment').run)],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          NODE_ENV: 'test',
          DEPLOYMENT_URL_B64: b64(DEPLOYMENT_URL),
          VERCEL_ORG_ID: 'team_1',
        },
      }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(calls().trim()).toBe(
      `node_modules/.bin/vercel alias set ${DEPLOYMENT_URL} staging.jov.ie --scope team_1`
    );
  });

  function prove(inspections: string[], resolvedId = DEPLOYMENT_ID) {
    const { root, bin, calls } = workspace({
      node: `printf '{"id":"${resolvedId}","url":"${DEPLOYMENT_URL}"}'`,
      'node_modules/.bin/vercel': `n=$(cat "$PWD/inspect-count" 2>/dev/null || echo 0); echo $((n + 1)) > "$PWD/inspect-count"
inspections=(${inspections.map(entry => `'${entry}'`).join(' ')})
last=$((\${#inspections[@]} - 1)); [ "$n" -gt "$last" ] && n=$last
printf '%s' "\${inspections[$n]}"`,
      sleep: 'exit 0',
    });
    const result = spawnSync(
      'bash',
      [
        '-c',
        String(
          step(
            alias,
            'Prove staging alias owns the SHA-attested exact deployment'
          ).run
        ),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          NODE_ENV: 'test',
          DEPLOYMENT_URL_B64: b64(DEPLOYMENT_URL),
          EXPECTED_DEPLOYMENT_ID: DEPLOYMENT_ID,
          EXPECTED_COMMIT_SHA: SHA,
          VERCEL_ORG_ID: 'team_1',
        },
      }
    );
    const inspects = calls()
      .split('\n')
      .filter(line => line.startsWith('node_modules/.bin/vercel inspect'));
    return { ...result, inspects };
  }

  it('waits for the alias to serve the exact READY deployment', () => {
    const converged = prove([
      '{"id":"dpl_Previous","readyState":"READY"}',
      `{"id":"${DEPLOYMENT_ID}","readyState":"BUILDING"}`,
      `{"id":"${DEPLOYMENT_ID}","readyState":"ready"}`,
    ]);
    expect(converged.status, converged.stdout + converged.stderr).toBe(0);
    expect(converged.inspects).toHaveLength(3);
    expect(converged.inspects[0]).toBe(
      'node_modules/.bin/vercel inspect staging.jov.ie --format=json --scope team_1'
    );

    const stuck = prove(['{"id":"dpl_Previous","readyState":"READY"}']);
    expect(stuck.status).toBe(1);
    expect(stuck.inspects).toHaveLength(15);
    expect(stuck.stdout).toContain('did not converge');

    const malformed = prove(['not json']);
    expect(malformed.status).toBe(1);
  });

  it('refuses before inspecting the alias when the exact deployment does not resolve', () => {
    const other = prove(
      [`{"id":"${DEPLOYMENT_ID}","readyState":"READY"}`],
      'dpl_Other'
    );
    expect(other.status).toBe(1);
    expect(other.inspects).toEqual([]);
  });
});

describe.skipIf(!gh)(
  'typed staging receipt (executed)',
  { timeout: 60_000 },
  () => {
    const receiptJob = job('staging-deployment-receipt');

    it('is written only after a current alias and never mutates production', () => {
      expect(receiptJob.needs).toEqual(['deploy-staging', 'alias-staging']);
      for (const condition of [
        "needs.alias-staging.result == 'success'",
        "needs.alias-staging.outputs.is_current == 'true'",
      ])
        expect(receiptJob.if).toContain(condition);
      const upload = step(
        receiptJob,
        'Upload exact staging deployment receipt'
      );
      expect(upload.with).toMatchObject({
        name: 'staging-deployment-${{ inputs.expected_sha }}',
        'if-no-files-found': 'error',
      });
      const runs = receiptJob.steps.map(entry => entry.run ?? '').join('\n');
      expect(runs).not.toMatch(/vercel (?:promote|rollback)/);
    });

    it('classifies the generation as current or superseded after mutation', async () => {
      const classify = String(
        step(receiptJob, 'Classify staging generation after mutation').run
      );
      for (const [main, outcome] of [
        [SHA, 'current'],
        [NEWER, 'superseded_after_mutation'],
      ] as const) {
        const root = realpathSync(
          mkdtempSync(join(tmpdir(), 'jovie-receipt-'))
        );
        roots.push(root);
        const output = join(root, 'output');
        writeFileSync(output, '');
        const result = await runWithRealGh({
          script: classify,
          env: {
            GITHUB_OUTPUT: output,
            GITHUB_REPOSITORY: 'JovieInc/Jovie',
            EXPECTED_COMMIT_SHA: SHA,
          },
          route: mainRoute(main),
        });
        expect(result.code, result.stderr).toBe(0);
        expect(readOutputs(output).staging_refresh_outcome).toBe(outcome);
      }
      const unresolved = await runWithRealGh({
        script: classify,
        env: {
          GITHUB_OUTPUT: '/dev/null',
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
        },
        route: () => null,
      });
      expect(unresolved.code).not.toBe(0);
    });

    it.each([
      [100, 'within_target'],
      [300, 'over_target'],
      [700, 'breach'],
    ])(
      'writes a terminal typed receipt with the %is latency SLO state',
      async (latency, sloState) => {
        const { root, bin } = workspace({
          // GNU date semantics for `date -u -d <iso> +%s`.
          date: `case "$*" in *-d*) echo ${NOW - latency} ;; '-u +%s') echo ${NOW} ;; *) /bin/date "$@" ;; esac`,
        });
        const output = join(root, 'output');
        writeFileSync(output, '');
        const result = await runWithRealGh({
          script: render(
            String(
              step(receiptJob, 'Write typed staging deployment receipt').run
            ),
            { github: { run_id: '1234', run_attempt: '2' } }
          ),
          env: {
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            GITHUB_OUTPUT: output,
            RUNNER_TEMP: root,
            GITHUB_REPOSITORY: 'JovieInc/Jovie',
            DEPLOYMENT_URL_B64: b64(DEPLOYMENT_URL),
            EXPECTED_COMMIT_SHA: SHA,
            EXPECTED_DEPLOYMENT_ID: DEPLOYMENT_ID,
            STAGING_REFRESH_OUTCOME: 'current',
            SOURCE_CI_COMPLETED_AT: '2026-10-03T00:00:00Z',
            SOURCE_CI_RUN_ATTEMPT: '1',
            SOURCE_CI_RUN_ID: '77',
          },
          route: mainRoute(NEWER),
        });
        expect(result.code, result.stderr).toBe(0);
        const receipt = JSON.parse(
          readFileSync(join(root, 'staging-deployment-receipt.json'), 'utf8')
        );
        expect(receipt).toMatchObject({
          schema: 'jovie-staging-deployment/v1',
          state: 'current',
          terminal: true,
          sha: SHA,
          currentMainSha: NEWER,
          deploymentId: DEPLOYMENT_ID,
          deploymentUrl: DEPLOYMENT_URL,
          alias: 'staging.jov.ie',
          environment: 'preview',
          sourceCiRunId: '77',
          sourceCiRunAttempt: '1',
          controllerRunId: '1234',
          controllerRunAttempt: '2',
          latencySeconds: latency,
          sloState,
          exactIdentity: 'passed',
          routeSmoke: 'passed',
          privacy: 'robots-block-all-and-http-noindex',
        });
        expect(readOutputs(output)).toMatchObject({
          deployed: 'true',
          deployment_id: DEPLOYMENT_ID,
          slo_state: sloState,
        });
      }
    );
  }
);

describe.skipIf(!gh)(
  'production release result (executed)',
  { timeout: 60_000 },
  () => {
    const resultJob = job('release-result');
    const resultStep = resultJob.steps[0] as Step;
    type Needs = Record<
      string,
      { result?: string; outputs?: Record<string, string> }
    >;
    const green: Needs = {
      'release-head': { outputs: { is_current: 'true' } },
      'staging-head': { outputs: { is_current: 'true' } },
      'alias-staging': { outputs: { is_current: 'true' } },
      'production-head': { outputs: { is_current: 'true' } },
      'promote-production': {
        outputs: {
          promotion_sha: SHA,
          production_deployment_id: 'dpl_Prod1',
          production_deployment_url_b64: b64(
            'https://jovie-abc123-jovie.vercel.app'
          ),
        },
      },
      'sentry-error-gate': { outputs: { gate_status: 'passed' } },
      'production-oauth-gate': { outputs: { gate_status: 'passed' } },
      'rollback-production': { result: 'skipped' },
    };

    async function resolveResult(
      overrides: Needs = {},
      stagingVerified = 'true'
    ) {
      const needs: Needs = { ...green };
      for (const [id, value] of Object.entries(overrides))
        needs[id] = {
          ...needs[id],
          ...value,
          outputs: { ...needs[id]?.outputs, ...value.outputs },
        };
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-result-')));
      roots.push(root);
      const output = join(root, 'output');
      writeFileSync(output, '');
      const promote = needs['promote-production']?.outputs ?? {};
      const result = await runWithRealGh({
        script: render(String(resultStep.run), {
          needs,
          inputs: { staging_verified: stagingVerified },
        }),
        env: {
          GITHUB_OUTPUT: output,
          EXPECTED_SHA: SHA,
          PROMOTION_SHA: promote.promotion_sha ?? '',
          PRODUCTION_DEPLOYMENT_ID: promote.production_deployment_id ?? '',
          PRODUCTION_DEPLOYMENT_URL_B64:
            promote.production_deployment_url_b64 ?? '',
          PREVIOUS_PRODUCTION_DEPLOYMENT_ID: 'dpl_Prev',
        },
        route: mainRoute(NEWER),
      });
      return { ...result, outputs: readOutputs(output) };
    }

    it('runs for every production release and reads every release job', () => {
      expect(resultJob.if).toBe(
        "${{ always() && inputs.release_mode == 'production' }}"
      );
      const script = String(resultStep.run);
      // Ordering only: the receipt's verdict reaches this job as
      // inputs.staging_verified from the controller.
      const orderingOnly = ['staging-deployment-receipt'];
      expect(resultJob.needs).toEqual(expect.arrayContaining(orderingOnly));
      for (const need of resultJob.needs ?? [])
        if (!orderingOnly.includes(need))
          expect(script, need).toContain(`needs.${need}.`);
    });

    it('releases an exactly promoted, fully gated, staging-verified generation', async () => {
      const released = await resolveResult();
      expect(released.code, released.stdout + released.stderr).toBe(0);
      expect(released.outputs).toMatchObject({
        released: 'true',
        superseded_before_promotion: 'false',
      });
      // A newer main does not erase the completed older generation.
      expect(released.stdout).toContain('preserving released=true');
    });

    it('never releases without the exact staging receipt', async () => {
      const unverified = await resolveResult({}, 'false');
      expect(unverified.code).toBe(1);
      expect(unverified.outputs.released).toBe('false');
      const supersededUnverified = await resolveResult(
        { 'production-head': { outputs: { is_current: 'false' } } },
        'false'
      );
      expect(supersededUnverified.code).toBe(1);
      const supersededVerified = await resolveResult({
        'production-head': { outputs: { is_current: 'false' } },
      });
      expect(supersededVerified.code).toBe(0);
      expect(supersededVerified.outputs.superseded_before_promotion).toBe(
        'true'
      );
      expect(supersededVerified.outputs.released).toBe('false');
    });

    it('never lets supersession mask failed release work', async () => {
      const masked = await resolveResult({
        'staging-head': { outputs: { is_current: 'false' } },
        'canary-health-gate': { result: 'failure' },
      });
      expect(masked.code).toBe(1);
      const aliasMasked = await resolveResult({
        'alias-staging': { outputs: { is_current: 'false' } },
        'attest-staging-build': { result: 'failure' },
      });
      expect(aliasMasked.code).toBe(1);
      const superseded = await resolveResult({
        'release-head': { outputs: { is_current: 'false' } },
      });
      expect(superseded.code).toBe(0);
      expect(superseded.outputs.superseded_before_promotion).toBe('true');
    });

    it('rolls back only on a confirmed gate failure and never reports it released', async () => {
      const restored = await resolveResult({
        'sentry-error-gate': { outputs: { gate_status: 'failed' } },
        'rollback-production': {
          result: 'success',
          outputs: { rolled_back: 'true' },
        },
      });
      expect(restored.code).toBe(1);
      expect(restored.stdout).toContain(
        'exact previous deployment was restored'
      );
      const notRestored = await resolveResult({
        'production-oauth-gate': { outputs: { gate_status: 'failed' } },
        'rollback-production': { result: 'failure' },
      });
      expect(notRestored.code).toBe(1);
      expect(notRestored.stdout).toContain('rollback did not complete');
      const uncertainRollback = await resolveResult({
        'sentry-error-gate': {
          result: 'failure',
          outputs: { gate_status: 'errored' },
        },
        'rollback-production': { result: 'success' },
      });
      expect(uncertainRollback.code).toBe(1);
      expect(uncertainRollback.stdout).toContain('must never trigger rollback');
      const strayRollback = await resolveResult({
        'rollback-production': { result: 'success' },
      });
      expect(strayRollback.code).toBe(1);
      for (const outcome of [
        restored,
        notRestored,
        uncertainRollback,
        strayRollback,
      ])
        expect(outcome.outputs.released).toBe('false');
    });

    it('requires every production gate and an exact immutable deployment', async () => {
      for (const gate of [
        'migrate-production',
        'production-public-profile-alias-gate',
        'promote-production',
      ]) {
        const failed = await resolveResult({ [gate]: { result: 'failure' } });
        expect(failed.code, gate).toBe(1);
        expect(failed.outputs.released, gate).toBe('false');
      }
      const aliasUrl = await resolveResult({
        'promote-production': {
          outputs: { production_deployment_url_b64: b64('https://jov.ie') },
        },
      });
      expect(aliasUrl.code).toBe(1);
      const noId = await resolveResult({
        'promote-production': {
          outputs: { production_deployment_id: 'unknown' },
        },
      });
      expect(noId.code).toBe(1);
    });
  }
);
