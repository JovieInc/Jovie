import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Clerk is retired (auth is Better Auth). The production chat canary kept
 * minting Clerk Backend API sessions long after that, so it could never run
 * (JOV-9822). No test may call the Clerk Backend API again. The one legacy
 * helper below only shrinks: delete it from the list when it is migrated.
 */
const ROOT = join(__dirname, '..', '..');
const SCANNED = ['tests', 'lib', 'app', 'scripts'];
const LEGACY = new Set(['tests/e2e/helpers/e2e-helpers.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.(m?[jt]sx?)$/u.test(name)
        ? [path]
        : [];
  });
}

describe('Clerk Backend API is retired', () => {
  it('no source or test calls api.clerk.com outside the shrinking legacy list', () => {
    const offenders = SCANNED.flatMap(dir => files(join(ROOT, dir)))
      .map(path => relative(ROOT, path))
      .filter(path => path !== 'tests/contracts/no-clerk-backend-api.test.ts')
      .filter(path => !LEGACY.has(path))
      .filter(path =>
        readFileSync(join(ROOT, path), 'utf8').includes('api.clerk.com')
      );
    expect(offenders).toEqual([]);
  });
});
