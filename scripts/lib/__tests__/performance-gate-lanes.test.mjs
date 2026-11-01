import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

// Release lead-time: the exact staged-build performance gate runs its
// independent budget families as concurrent lanes. Parallelism may never
// weaken the gate: every guard, budget and run count must still execute, and
// any lane failing must still block promotion with the exact-build subtype.
const root = resolve(import.meta.dirname, '../../..');
/** @type {{ jobs: Record<string, { steps: Array<Record<string, any>> }> }} */
const workflow = /** @type {any} */ (
  load(
    readFileSync(join(root, '.github/workflows/production-release.yml'), 'utf8')
  )
);
const gate = workflow.jobs['promote-production'].steps.find(
  item => item.id === 'performance-gate'
);

const GUARD_INVOCATIONS = [
  'scripts/performance-budgets-guard.ts',
  'scripts/lighthouse-entry-gate.ts',
];

describe('exact-build performance gate lanes', () => {
  it('keeps every budget family, run count and fail-closed handler', () => {
    for (const invocation of GUARD_INVOCATIONS) {
      expect(gate.run).toContain(invocation);
    }
    for (const needle of [
      '--runs 3',
      '--runs 5',
      '--route-id creator-tasks',
      '--route-id public-profile-releases',
      '--lcp-report-only',
      'fail_performance_gate "Canonical six-route browser budgets failed',
      'fail_performance_gate "Exact staged-build public-profile alias budgets failed."',
      'fail_performance_gate "Throttled-mobile entry-route CLS or measurement failed',
    ]) {
      expect(gate.run).toContain(needle);
    }
    expect(gate.run).not.toContain('|| true');
    expect(gate['continue-on-error']).toBeUndefined();
    expect(gate.run).not.toContain('::warning::');
  });

  it('runs two lanes concurrently and fails unless both exit 0', () => {
    expect(gate.run).toContain(
      '( authenticated_budget_lane && entry_route_lighthouse_lane )'
    );
    expect(gate.run).toContain('( public_profile_budget_lane )');
    expect(gate.run).toContain('wait "$authenticated_lane_pid"');
    expect(gate.run).toContain('wait "$public_lane_pid"');
    const decide = gate.run.indexOf(
      'if [ "$authenticated_lane_status" -ne 0 ]'
    );
    const passed = gate.run.indexOf('echo "performance_status=passed"');
    expect(decide).toBeGreaterThan(0);
    expect(passed).toBeGreaterThan(decide);
  });

  const run = failingMatch => {
    const temp = mkdtempSync(join(tmpdir(), 'perf-lanes-'));
    try {
      const bin = join(temp, 'bin');
      mkdirSync(bin);
      mkdirSync(join(temp, 'apps/web'), { recursive: true });
      const stub = (name, body) => {
        writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
        chmodSync(join(bin, name), 0o755);
      };
      stub(
        'doppler',
        'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"'
      );
      stub(
        'node',
        'echo \'{"cookies":[1]}\' > "$PERFORMANCE_AUTH_STATE_PATH"; exit 0'
      );
      stub('jq', 'exit 0');
      stub(
        'pnpm',
        failingMatch
          ? `case "$*" in *${failingMatch}*) exit 7;; esac; exit 0`
          : 'exit 0'
      );
      writeFileSync(join(temp, 'gate.sh'), gate.run);
      writeFileSync(join(temp, 'out'), '');
      const result = spawnSync('bash', ['gate.sh'], {
        cwd: temp,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: temp,
          GITHUB_RUN_ID: '1',
          GITHUB_WORKSPACE: temp,
          GITHUB_OUTPUT: join(temp, 'out'),
          DOPPLER_TOKEN: 'x',
          E2E_PROD_USER_EMAIL: 'e',
          DATABASE_URL: 'd',
          PLAYWRIGHT_VERCEL_BYPASS_SECRET: 's',
          EXPECTED_COMMIT_SHA: 'a',
          PRODUCTION_DEPLOYMENT_URL_B64: Buffer.from(
            'https://jovie-abc-jovie.vercel.app'
          ).toString('base64'),
        },
      });
      return { ...result, output: readFileSync(join(temp, 'out'), 'utf8') };
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  };

  it('passes only when every lane passes', () => {
    const result = run('');
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/^performance_status=passed$/m);
    expect(result.output).toContain('authenticated_performance_status=passed');
  });

  for (const failing of [
    'creator-tasks',
    'public-profile-tip',
    'lighthouse-entry-gate',
  ]) {
    it(`blocks promotion when ${failing} fails`, () => {
      const result = run(failing);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'failure_subtype=exact_build_performance_failed'
      );
      expect(result.output).not.toMatch(/^performance_status=passed$/m);
      expect(result.stdout).toContain('::error::');
    });
  }
});
