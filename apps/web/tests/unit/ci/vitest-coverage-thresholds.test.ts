import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..');

const CRITICAL_GLOBS = [
  'lib/entitlements/**/*.ts',
  'app/api/stripe/webhooks/**/*.ts',
  'app/api/webhooks/**/*.ts',
  'app/api/dev/test-auth/**/*.ts',
  'lib/auth/test-mode.ts',
] as const;

function readThresholds(
  configPath: string
): Map<string, { branches: number; lines: number }> {
  const source = readFileSync(configPath, 'utf8');
  const thresholds = new Map<string, { branches: number; lines: number }>();

  for (const glob of CRITICAL_GLOBS) {
    const escaped = glob.replaceAll('*', '\\*').replaceAll('.', '\\.');
    const match = source.match(
      new RegExp(
        `'${escaped}':\\s*\\{\\s*branches:\\s*(\\d+),\\s*lines:\\s*(\\d+)\\s*\\}`
      )
    );
    expect(
      match,
      `Missing per-glob threshold for ${glob} in ${configPath}`
    ).toBeTruthy();
    thresholds.set(glob, {
      branches: Number(match?.[1]),
      lines: Number(match?.[2]),
    });
  }

  return thresholds;
}

describe('vitest critical-surface coverage floors', () => {
  it('keeps per-glob floors above zero in the fast and CI configs', () => {
    const fast = readThresholds(resolve(webRoot, 'vitest.config.fast.mts'));
    const ci = readThresholds(resolve(webRoot, 'vitest.config.ci.mts'));

    for (const glob of CRITICAL_GLOBS) {
      const fastFloor = fast.get(glob)!;
      const ciFloor = ci.get(glob)!;
      expect(fastFloor.branches, glob).toBeGreaterThan(0);
      expect(fastFloor.lines, glob).toBeGreaterThan(0);
      expect(ciFloor).toEqual(fastFloor);
    }
  });

  it('skips the Playwright-browser guard spec only on coverage runs', () => {
    const source = readFileSync(
      resolve(webRoot, 'vitest.config.fast.mts'),
      'utf8'
    );

    expect(source).toContain("process.argv.includes('--coverage')");
    expect(source).toContain(
      "'tests/unit/ci/playwright-artifact-secrets.test.ts'"
    );
    expect(source).toContain("'.artifact-comparison-*/**'");
  });
});
