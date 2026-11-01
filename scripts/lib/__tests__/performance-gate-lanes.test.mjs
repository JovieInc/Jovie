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
      'public-profile-releases',
      '--lcp-report-only',
      'fail_performance_gate "Canonical six-route browser budgets failed',
      'fail_performance_gate "Exact staged-build public-profile alias budgets failed on certified pages (${blocking})."',
      'fail_performance_gate "Throttled-mobile entry-route CLS or measurement failed',
    ]) {
      expect(gate.run).toContain(needle);
    }
    expect(gate.run).not.toContain('|| true');
    expect(gate['continue-on-error']).toBeUndefined();
    // The only warning is the certified-only alias rule (Tim 2026-10-31):
    // uncertified alias routes warn and file one Linear perf ticket.
    const warnings = gate.run.match(/::warning::/g) ?? [];
    expect(warnings).toHaveLength(1);
    expect(gate.run).toMatch(
      /if ! staged_alias_guard \$warning; then\s+echo "::warning::Exact staged-build public-profile alias budgets missed on uncertified pages[\s\S]*?staged-alias-perf-intake\.mjs/
    );
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

  const run = (failingMatch, { certify = false } = {}) => {
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
        [
          'case "$1" in',
          '  *alias-gate-certified-routes.mjs) shift;',
          '    if [ -n "${CERTIFY:-}" ]; then echo certification=present; echo "blocking=$*";',
          '    else echo certification=unavailable; echo "warning=$*"; fi; exit 0;;',
          '  *staged-alias-perf-intake.mjs) echo "intake=$*" >> "$GITHUB_OUTPUT"; exit 0;;',
          'esac',
          'echo \'{"cookies":[1]}\' > "$PERFORMANCE_AUTH_STATE_PATH"; exit 0',
        ].join('\n')
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
          CERTIFY: certify ? '1' : '',
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

  it('warns and files a perf ticket when an uncertified alias route misses', () => {
    const result = run('public-profile-tip');
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/^performance_status=passed$/m);
    expect(result.output).toMatch(
      /^intake=.*--routes public-profile-listen .*public-profile-tip/m
    );
    expect(result.stdout).toContain('::warning::');
  });

  for (const { failing, certify } of [
    { failing: 'creator-tasks', certify: false },
    { failing: 'public-profile-tip', certify: true },
    { failing: 'lighthouse-entry-gate', certify: false },
  ]) {
    it(`blocks promotion when ${failing} fails${certify ? ' on a certified page' : ''}`, () => {
      const result = run(failing, { certify });
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'failure_subtype=exact_build_performance_failed'
      );
      expect(result.output).not.toMatch(/^performance_status=passed$/m);
      expect(result.stdout).toContain('::error::');
    });
  }
});
