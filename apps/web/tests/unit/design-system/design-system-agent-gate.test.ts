import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Runs the design-system agent gate as CI would.
 *
 * The gate itself is pure Node (`scripts/design-system-agent-gate.mjs`); this
 * vitest wrapper ensures Unit Tests / affected-test selection exercise it so
 * agents cannot ship off-system UI without a red signal.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web → repo root (5 levels up)
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const GATE = join(REPO_ROOT, 'scripts', 'design-system-agent-gate.mjs');

describe('design-system agent gate', () => {
  it('script exists and is executable via node', () => {
    expect(existsSync(GATE)).toBe(true);
  });

  it('passes on the current branch changed-set (no new off-system UI)', () => {
    const result = spawnSync(process.execPath, [GATE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: process.env,
    });

    if (result.status !== 0) {
      // Surface gate stderr so CI failures are actionable.
      // eslint-disable-next-line no-console
      console.error(result.stdout);
      // eslint-disable-next-line no-console
      console.error(result.stderr);
    }

    expect(
      result.status,
      `design-system:gate failed:\n${result.stderr || result.stdout}`
    ).toBe(0);
    expect(result.stdout + result.stderr).toMatch(
      /\[design-system-agent-gate\] clean/
    );
  }, 60_000);

  it('unit fixture suite for the gate stays green', () => {
    const testFile = join(REPO_ROOT, 'scripts', 'design-system-agent-gate.test.mjs');
    expect(existsSync(testFile)).toBe(true);
    const result = spawnSync(process.execPath, ['--test', testFile], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: process.env,
    });
    expect(
      result.status,
      `design-system-agent-gate.test.mjs failed:\n${result.stderr || result.stdout}`
    ).toBe(0);
  }, 60_000);
});
