import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEnvFilePath } from './check-signup-readiness';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptsDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const testDirName = `.tmp-signup-readiness-env-file-test-${process.pid}`;
const testDir = resolve(repoRoot, testDirName);

afterEach(() => {
  rmSync(testDir, { force: true, recursive: true });
});

describe('signup readiness env file resolution', () => {
  it('finds repo-root Vercel env files when invoked from the web package cwd', () => {
    const relativeEnvPath = `${testDirName}/prod.env`;
    const repoEnvPath = resolve(repoRoot, relativeEnvPath);
    mkdirSync(dirname(repoEnvPath), { recursive: true });
    writeFileSync(repoEnvPath, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test\n');

    const originalCwd = process.cwd();
    process.chdir(webRoot);

    try {
      expect(resolveEnvFilePath(relativeEnvPath)).toBe(repoEnvPath);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
