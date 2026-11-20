import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
// A workflow command at the start of any line becomes a real annotation on the
// job. Tests that exercise rate-limit refusals print such lines with fake resets
// (resets at <now+10000s>); on 2026-10-25 three workers read them as live quota
// deferrals. These tests run the noisy suites and assert none of that output
// reaches a log line the runner would parse.
// `# ` covers node:test's TAP diagnostics, which forward a child's stderr line by line.
const COMMAND =
  /(?:^|# )(?:::(?:error|warning|notice)(?:\s[^:]*)?::|##\[(?:error|warning)\])/m;

function runCaptured(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, GITHUB_ACTIONS: 'true', CI: 'true' },
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

describe('mocked rate-limit refusals never become annotations', () => {
  it('testflight-release-lease tests emit no workflow commands', () => {
    const { status, output } = runCaptured('node', [
      '--test',
      '.github/scripts/testflight-release-lease.test.mjs',
    ]);
    expect(status, output.slice(-400)).toBe(0);
    expect(output).not.toMatch(COMMAND);
    expect(output).not.toMatch(/GitHub rate limit resets at \d+/);
  });

  it('main-release-readiness tests emit no workflow commands', () => {
    const { status, output } = runCaptured('pnpm', [
      'exec',
      'vitest',
      '--root',
      'scripts',
      '--config',
      'vitest.config.mts',
      'run',
      'lib/__tests__/main-release-readiness.test.mjs',
    ]);
    expect(status, output.slice(-400)).toBe(0);
    expect(output).not.toMatch(COMMAND);
  });

  it('Source Validation pools disk-read source guards and still wraps each in stop-commands', () => {
    const workflow = readFileSync(
      resolve(ROOT, '.github/workflows/source-validation.yml'),
      'utf8'
    );
    const step = workflow.slice(
      workflow.indexOf('Validate disk-read source contracts from trusted base')
    );
    const body = step.slice(0, step.indexOf('\n      - name:', 10));
    // Bounded pool (#26000) owns the per-guard stop-commands window; the
    // workflow must call it instead of a serial spawnSync loop.
    expect(body).toContain('ci-source-guard-pool.mjs');
    expect(body).toContain('runSourceGuards');
    expect(body).toContain('SOURCE_GUARD_CONCURRENCY');
    expect(body).not.toContain('spawnSync(guard.command');
    const pool = readFileSync(
      resolve(ROOT, 'scripts/lib/ci-source-guard-pool.mjs'),
      'utf8'
    );
    const stop = pool.indexOf('::stop-commands::${token}');
    const resume = pool.indexOf('::${token}::');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(resume);
    expect(pool).toContain('randomUUID()');
  });
});
