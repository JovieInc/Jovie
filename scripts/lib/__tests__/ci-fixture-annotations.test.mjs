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
      // Exercise the quota-emitting fixtures; the full lease suite already runs
      // in SCRIPT_CONTRACT_NODE_TESTS, including its real-gh integration.
      '--test-name-pattern=installation quota exhaustion|installation rate limit',
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

  it('Source Validation wraps each disk-read source guard in stop-commands', () => {
    const workflow = readFileSync(
      resolve(ROOT, '.github/workflows/source-validation.yml'),
      'utf8'
    );
    const step = workflow.slice(
      workflow.indexOf('Validate disk-read source contracts from trusted base')
    );
    const body = step.slice(0, step.indexOf('\n      - name:', 10));
    const stop = body.indexOf('::stop-commands::${token}');
    const spawn = body.indexOf('spawnSync(guard.command');
    const resume = body.indexOf('::${token}::');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(spawn);
    expect(spawn).toBeLessThan(resume);
    expect(body).toContain('randomUUID()');
  });
});
