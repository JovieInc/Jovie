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

// JOV-7707: post-deploy probes and Production Verified are proven by
// executing the shipped production-controller.yml shell with stub tools and
// the real gh CLI, plus parsed-YAML policy for the probe jobs.

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
type Job = {
  'runs-on'?: string;
  'continue-on-error'?: unknown;
  permissions?: Record<string, string>;
  concurrency?: unknown;
  needs?: string[];
  if?: string;
  steps: Step[];
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const controller = parseYaml(
  readFileSync(
    resolve(repoRoot, '.github/workflows/production-controller.yml'),
    'utf8'
  )
) as { jobs: Record<string, Job> };
const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7707: CI must provide the real gh binary.');
}
const SHA = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);
const DEPLOYMENT_ID = 'dpl_Prod1';
const DEPLOYMENT_URL = 'https://jovie-abc123-jovie.vercel.app';
const b64 = (value: string) => Buffer.from(value).toString('base64');
const roots: string[] = [];
const probeJobs = [
  'ci-public-profile-smoke',
  'ci-post-deploy-auth-smoke',
  'lighthouse-ci',
];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const job = (id: string) => {
  const found = controller.jobs[id];
  expect(found, id).toBeDefined();
  return found as Job;
};
const stepBy = (owner: Job, key: string) => {
  const found = owner.steps.find(
    entry => entry.id === key || entry.name === key
  );
  expect(found, key).toBeDefined();
  return found as Step;
};

function workspace(stubs: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-verified-')));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [path, body] of Object.entries(stubs)) {
    const target = path.includes('/') ? join(root, path) : join(bin, path);
    mkdirSync(join(target, '..'), { recursive: true });
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

type Context = {
  needs?: Record<string, { result?: string; outputs?: Record<string, string> }>;
  steps?: Record<
    string,
    { outcome?: string; outputs?: Record<string, string> }
  >;
};

// Renders ${{ }} the way Actions would for one scenario.
function render(script: string, context: Context) {
  return script.replace(
    /\$\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => {
      let match = expression.match(/^needs\.([\w-]+)\.result$/);
      if (match?.[1]) return context.needs?.[match[1]]?.result ?? 'success';
      match = expression.match(/^needs\.([\w-]+)\.outputs\.(\w+)$/);
      if (match?.[1] && match[2])
        return context.needs?.[match[1]]?.outputs?.[match[2]] ?? '';
      match = expression.match(/^steps\.([\w-]+)\.outcome$/);
      if (match?.[1]) return context.steps?.[match[1]]?.outcome ?? 'success';
      match = expression.match(/^steps\.([\w-]+)\.outputs\.(\w+)$/);
      if (match?.[1] && match[2])
        return context.steps?.[match[1]]?.outputs?.[match[2]] ?? '';
      if (expression === 'github.repository') return 'JovieInc/Jovie';
      if (expression === 'github.run_id') return '900';
      if (expression === 'github.run_attempt') return '1';
      return '';
    }
  );
}

const mainRoute = (sha: string) => (path: string) =>
  path.startsWith('repos/JovieInc/Jovie/commits/main')
    ? { body: { sha } }
    : null;

describe('post-deploy probe jobs', () => {
  it('probe the exact immutable deployment on hosted, read-only, fail-closed jobs', () => {
    for (const id of probeJobs) {
      const probe = job(id);
      expect(probe['runs-on'], id).toBe('ubuntu-latest');
      expect(probe['continue-on-error'], id).toBeUndefined();
      expect(probe.permissions, id).toEqual({ contents: 'read' });
      expect(probe.needs, id).toEqual([
        'authorize-production',
        'production-release',
      ]);
      const checkout = probe.steps.find(entry =>
        entry.uses?.startsWith('actions/checkout@')
      );
      expect(checkout?.with?.['persist-credentials'], id).toBe(false);
      const serialized = JSON.stringify(probe);
      expect(serialized, id).toContain(
        '${{ needs.production-release.outputs.production_deployment_url_b64 }}'
      );
      expect(serialized, id).not.toContain(
        'needs.production-release.outputs.production_deployment_url }}'
      );
      // Canonical alias proof belongs to Production Verified only.
      expect(serialized, id).not.toContain('verify-production-alias.sh');
    }
  });

  it('scopes the bypass secret per step and keeps passwords out of auth smoke', () => {
    const auth = job('ci-post-deploy-auth-smoke');
    const smoke = stepBy(auth, 'auth-result');
    expect(smoke.env?.PLAYWRIGHT_VERCEL_BYPASS_SECRET).toBe(
      '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(smoke.env?.EXPECTED_COMMIT_SHA).toBe(
      '${{ needs.authorize-production.outputs.expected_sha }}'
    );
    expect(JSON.stringify(auth)).not.toContain(
      '"VERCEL_AUTOMATION_BYPASS_SECRET"'
    );
    expect(JSON.stringify(auth)).not.toContain('E2E_PROD_USER_PASSWORD');
    expect(stepBy(auth, 'check-creds').env).toEqual({
      DOPPLER_TOKEN: '${{ secrets.DOPPLER_TOKEN_PRD }}',
    });
  });

  it('classifies production auth credentials through an isolated Doppler child', () => {
    const check = String(
      stepBy(job('ci-post-deploy-auth-smoke'), 'check-creds').run
    );
    const run = (token: string, dopplerExit: number) => {
      const { root, bin, calls } = workspace({
        doppler: `exit ${dopplerExit}`,
      });
      const output = join(root, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', check], {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          NODE_ENV: 'test',
          GITHUB_OUTPUT: output,
          DOPPLER_TOKEN: token,
        },
      });
      return { ...result, outputs: readOutputs(output), calls: calls() };
    };
    const configured = run('dp.st.token', 0);
    expect(configured.status).toBe(0);
    expect(configured.outputs.credentials_configured).toBe('true');
    expect(configured.calls).toContain(
      '--only-secrets=E2E_PROD_USER_EMAIL,DATABASE_URL --no-fallback -- env -u DOPPLER_TOKEN bash -c'
    );
    for (const [token, exit] of [
      ['', 0],
      ['dp.st.token', 1],
    ] as const) {
      const missing = run(token, exit);
      expect(missing.status).toBe(0);
      expect(missing.outputs).toMatchObject({
        credentials_configured: 'false',
        auth_smoke_status: 'not-configured',
      });
    }
  });

  it('builds a Lighthouse config pinned to the exact deployment URL', () => {
    const lighthouse = job('lighthouse-ci');
    const names = lighthouse.steps.map(entry => entry.name);
    const order = [
      'Establish Lighthouse job deadline',
      'Build exact-deployment Lighthouse config',
      'Collect Lighthouse against exact production deployment',
      'Assert Lighthouse production budgets',
      'Validate and upload hash-sealed Lighthouse evidence',
      'Remove Lighthouse sensitive probe state',
    ].map(name => names.indexOf(name));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(
      stepBy(lighthouse, 'Remove Lighthouse sensitive probe state').if
    ).toBe('${{ always() }}');
    expect(JSON.stringify(lighthouse)).not.toMatch(/lhci autorun|extraHeaders/);

    const build = String(
      stepBy(lighthouse, 'Build exact-deployment Lighthouse config').run
    );
    const run = (url: string) => {
      const { root, bin, calls } = workspace({ pnpm: 'exit 0' });
      mkdirSync(join(root, 'apps/web'), { recursive: true });
      writeFileSync(
        join(root, 'apps/web/.lighthouserc.json'),
        readFileSync(resolve(repoRoot, 'apps/web/.lighthouserc.json'))
      );
      const result = spawnSync('bash', ['-c', build], {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          NODE_ENV: 'test',
          RUNNER_TEMP: root,
          GITHUB_ENV: join(root, 'github-env'),
          PRODUCTION_BASE_URL_B64: b64(url),
        },
      });
      return { ...result, root, calls: calls() };
    };
    const exact = run(`${DEPLOYMENT_URL}/`);
    expect(exact.status, exact.stderr).toBe(0);
    const config = JSON.parse(
      readFileSync(join(exact.root, 'lighthouse-production-exact.json'), 'utf8')
    );
    expect(config.ci.collect.url).toEqual([
      `${DEPLOYMENT_URL}/`,
      `${DEPLOYMENT_URL}/tim`,
    ]);
    expect(config.ci.collect.puppeteerScript).toBe(
      'scripts/lighthouse-vercel-bypass.cjs'
    );
    expect(config.ci.collect.settings.disableStorageReset).toBe(true);
    expect(config.ci.assert.includePassedAssertions).toBe(true);
    const [home, profile] = config.ci.assert.assertMatrix.map(
      (entry: { matchingUrlPattern: string }) =>
        new RegExp(entry.matchingUrlPattern)
    );
    expect(home.test(`${DEPLOYMENT_URL}/`)).toBe(true);
    expect(home.test('https://jovie-abc123-jovieXvercel.app/')).toBe(false);
    expect(profile.test(`${DEPLOYMENT_URL}/tim`)).toBe(true);
    expect(profile.test(`${DEPLOYMENT_URL}/timothy`)).toBe(false);
    expect(readFileSync(join(exact.root, 'github-env'), 'utf8')).toContain(
      `EXPECTED_VERCEL_DEPLOYMENT_ORIGIN=${DEPLOYMENT_URL}\nEXPECTED_VERCEL_ENVIRONMENT=production`
    );
    expect(exact.calls).toContain('lighthouse-exact-target-guard.ts');

    for (const url of [
      'https://jov.ie',
      'https://evil.example/jovie-x-jovie.vercel.app',
    ]) {
      const rejected = run(url);
      expect(rejected.status, url).toBe(1);
      expect(rejected.calls, url).toBe('');
    }
  });
});

describe.skipIf(!gh)(
  'Production Verified (executed)',
  { timeout: 60_000 },
  () => {
    const verified = job('production-verified');
    type Needs = NonNullable<Context['needs']>;
    const greenNeeds: Needs = {
      'authorize-production': {
        outputs: {
          authorized: 'true',
          expected_sha: SHA,
          run_web: 'true',
          selected_lanes: 'web,operations',
          deployed_sha: SHA,
          web_evidence_sha: SHA,
        },
      },
      'production-release': {
        outputs: {
          released: 'true',
          superseded_before_promotion: 'false',
          production_deployment_id: DEPLOYMENT_ID,
          production_deployment_url_b64: b64(DEPLOYMENT_URL),
          sentry_gate_status: 'passed',
          oauth_gate_status: 'passed',
        },
      },
      'ci-post-deploy-auth-smoke': {
        outputs: {
          credentials_configured: 'true',
          auth_smoke_status: 'passed',
        },
      },
    };
    const merge = (overrides: Needs): Needs => {
      const needs: Needs = { ...greenNeeds };
      for (const [id, value] of Object.entries(overrides))
        needs[id] = {
          ...needs[id],
          ...value,
          outputs: { ...needs[id]?.outputs, ...value.outputs },
        };
      return needs;
    };

    it('waits for every probe and never serializes behind a concurrency group', () => {
      expect(verified.needs).toEqual(expect.arrayContaining(probeJobs));
      expect(verified.concurrency).toBeUndefined();
      for (const condition of [
        'always()',
        "needs.authorize-production.result == 'success'",
        "needs.authorize-production.outputs.already_verified != 'true'",
      ])
        expect(verified.if).toContain(condition);
      expect(stepBy(verified, 'finalize').if).toContain(
        "steps.verify.outputs.canonical_verified == 'true'"
      );
    });

    async function verify(overrides: Needs = {}, main = SHA) {
      const { root, bin, calls } = workspace({
        '.github/scripts/verify-production-alias.sh': 'exit 0',
        node: 'echo "base=$DONE_INVARIANT_PRODUCTION_BASE_URL" >> "$PWD/calls.log"',
      });
      const output = join(root, 'output');
      writeFileSync(output, '');
      const step = stepBy(verified, 'verify');
      const result = await runWithRealGh({
        script: `cd "${root}"\n${render(String(step.run), { needs: merge(overrides) })}`,
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          GITHUB_OUTPUT: output,
          EXPECTED_COMMIT_SHA: SHA,
          EXPECTED_PRODUCTION_DEPLOYMENT_ID:
            merge(overrides)['production-release']?.outputs
              ?.production_deployment_id ?? '',
          PRODUCTION_DEPLOYMENT_URL_B64:
            merge(overrides)['production-release']?.outputs
              ?.production_deployment_url_b64 ?? '',
        },
        route: mainRoute(main),
      });
      return { ...result, outputs: readOutputs(output), calls: calls() };
    }

    it('verifies the canonical alias only after every probe passed', async () => {
      const green = await verify();
      expect(green.code, green.stdout + green.stderr).toBe(0);
      expect(green.outputs).toMatchObject({
        canonical_verified: 'true',
        canonical_deployment_id: DEPLOYMENT_ID,
        canonical_sha: SHA,
        superseded_after_public_bind: 'false',
      });
      expect(green.calls).toContain('verify-production-alias.sh');
      expect(green.calls).toContain(`base=${DEPLOYMENT_URL}`);
      const advanced = await verify({}, NEWER);
      expect(advanced.code).toBe(0);
      expect(advanced.outputs.superseded_after_public_bind).toBe('true');
    });

    it.each([
      [
        'unauthorized source CI',
        { 'authorize-production': { outputs: { authorized: 'false' } } },
      ],
      ['failed release', { 'production-release': { result: 'failure' } }],
      [
        'unreleased generation',
        { 'production-release': { outputs: { released: 'false' } } },
      ],
      [
        'missing deployment id',
        { 'production-release': { outputs: { production_deployment_id: '' } } },
      ],
      [
        'canonical alias instead of the immutable URL',
        {
          'production-release': {
            outputs: { production_deployment_url_b64: b64('https://jov.ie') },
          },
        },
      ],
      [
        'failed public smoke',
        { 'ci-public-profile-smoke': { result: 'failure' } },
      ],
      ['failed Lighthouse', { 'lighthouse-ci': { result: 'cancelled' } }],
      [
        'failed auth lane',
        { 'ci-post-deploy-auth-smoke': { result: 'failure' } },
      ],
      [
        'unconfigured auth credentials',
        {
          'ci-post-deploy-auth-smoke': {
            outputs: {
              credentials_configured: 'false',
              auth_smoke_status: 'not-configured',
            },
          },
        },
      ],
      [
        'auth smoke without passing evidence',
        { 'ci-post-deploy-auth-smoke': { outputs: { auth_smoke_status: '' } } },
      ],
      [
        'contradictory pre-promotion supersession',
        {
          'production-release': {
            result: 'failure',
            outputs: { superseded_before_promotion: 'true' },
          },
        },
      ],
    ] satisfies [string, Needs][])(
      'refuses canonical verification on %s',
      async (_name, overrides) => {
        const result = await verify(overrides);
        expect(result.code).toBe(1);
        expect(result.outputs.canonical_verified).toBe('false');
        expect(result.calls).not.toContain('verify-production-alias.sh');
      }
    );

    it('stands down without proof for an intentionally superseded release', async () => {
      const superseded = await verify({
        'production-release': {
          outputs: { superseded_before_promotion: 'true', released: 'false' },
        },
      });
      expect(superseded.code).toBe(0);
      expect(superseded.outputs.canonical_verified).toBe('false');
      expect(superseded.calls).not.toContain('verify-production-alias.sh');
    });

    async function finalize(
      overrides: Needs = {},
      steps: Context['steps'] = {},
      main = SHA
    ) {
      const { root, bin, calls } = workspace({ node: 'exit 0' });
      mkdirSync(join(root, 'release-lineage'));
      writeFileSync(
        join(root, 'release-lineage/fleet-admission.json'),
        JSON.stringify({ scopedAdmission: { admitted: true } })
      );
      const output = join(root, 'output');
      writeFileSync(output, '');
      const needs = merge(overrides);
      const authorize = needs['authorize-production']?.outputs ?? {};
      const result = await runWithRealGh({
        script: render(String(stepBy(verified, 'finalize').run), {
          needs,
          steps: {
            verify: {
              outcome: 'success',
              outputs: {
                canonical_verified: 'true',
                canonical_deployment_id: DEPLOYMENT_ID,
                canonical_sha: SHA,
              },
            },
            ...steps,
          },
        }),
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          GITHUB_OUTPUT: output,
          RUNNER_TEMP: root,
          EXPECTED_SHA: SHA,
          DEPLOYMENT_ID:
            needs['production-release']?.outputs?.production_deployment_id ??
            '',
          AUTH_SMOKE_STATUS:
            needs['ci-post-deploy-auth-smoke']?.outputs?.auth_smoke_status ??
            '',
          RUN_WEB: authorize.run_web ?? '',
          SELECTED_LANES: authorize.selected_lanes ?? '',
          DEPLOYED_SHA: authorize.deployed_sha ?? '',
          WEB_EVIDENCE_SHA: authorize.web_evidence_sha ?? '',
        },
        route: mainRoute(main),
      });
      const markerPath = join(root, 'production-generation-verified.json');
      return {
        ...result,
        outputs: readOutputs(output),
        marker: existsSync(markerPath)
          ? JSON.parse(readFileSync(markerPath, 'utf8'))
          : null,
        calls: calls(),
      };
    }

    it('writes the verified marker only for an exactly verified generation', async () => {
      const promoted = await finalize();
      expect(promoted.code, promoted.stdout + promoted.stderr).toBe(0);
      expect(promoted.outputs.verified).toBe('true');
      expect(promoted.marker).toMatchObject({
        sha: SHA,
        deploymentId: DEPLOYMENT_ID,
        authSmoke: 'passed',
        terminalReason: 'promoted',
        selectedLanes: ['web', 'operations'],
        controllerRun: '900',
        fleetAdmission: { admitted: true },
      });

      const supersededWithProof = await finalize({}, {}, NEWER);
      expect(supersededWithProof.code).toBe(0);
      expect(supersededWithProof.marker?.terminalReason).toBe(
        'skipped_superseded'
      );

      const supersededWithoutProof = await finalize(
        {},
        { verify: { outcome: 'failure', outputs: {} } },
        NEWER
      );
      expect(supersededWithoutProof.code).toBe(1);
      expect(supersededWithoutProof.marker).toBeNull();
    });

    it.each([
      [
        'unauthorized source CI',
        { 'authorize-production': { outputs: { authorized: 'false' } } },
        {},
      ],
      [
        'a failed Sentry gate',
        { 'production-release': { outputs: { sentry_gate_status: 'failed' } } },
        {},
      ],
      [
        'an errored OAuth gate',
        { 'production-release': { outputs: { oauth_gate_status: 'errored' } } },
        {},
      ],
      [
        'canonical proof for another deployment',
        {},
        {
          verify: {
            outcome: 'success',
            outputs: {
              canonical_verified: 'true',
              canonical_deployment_id: 'dpl_Other',
              canonical_sha: SHA,
            },
          },
        },
      ],
    ] satisfies [string, Needs, Context['steps']][])(
      'writes no marker for %s',
      async (_name, overrides, steps) => {
        const result = await finalize(overrides, steps);
        expect(result.code).toBe(1);
        expect(result.outputs.verified).toBe('false');
        expect(result.marker).toBeNull();
      }
    );

    it('records a no-web generation only when every web lane was skipped', async () => {
      const skippedWeb = {
        'authorize-production': {
          outputs: { run_web: 'false', selected_lanes: 'ios' },
        },
        'production-release': { result: 'skipped' },
        'ci-public-profile-smoke': { result: 'skipped' },
        'ci-post-deploy-auth-smoke': { result: 'skipped' },
        'lighthouse-ci': { result: 'skipped' },
      };
      const noWeb = await finalize(skippedWeb);
      expect(noWeb.code, noWeb.stderr).toBe(0);
      expect(noWeb.marker).toMatchObject({
        deploymentId: 'not-applicable',
        authSmoke: 'not-applicable',
        terminalReason: 'skipped_no_web',
        selectedLanes: ['ios'],
      });
      expect(noWeb.calls).toContain('assert-live-production-bind.mjs');
      const webRan = await finalize({
        ...skippedWeb,
        'lighthouse-ci': { result: 'success' },
      });
      expect(webRan.code).toBe(1);
      expect(webRan.marker).toBeNull();
    });
  }
);
