import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, and GHSA-p3m5-59mp-jv5r are fixed
 * only in 16.4.1 on this line. 16.3.8 and 17.0.0 are both vulnerable.
 */
const PATCHED_NEXT_RUNTIME = /^16\.4\.1$/;

function isPatchedNextRuntime(version: string): boolean {
  return PATCHED_NEXT_RUNTIME.test(version);
}

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);
const nextApps = readdirSync(resolve(repoRoot, 'apps')).flatMap(app => {
  const path = resolve(repoRoot, 'apps', app, 'package.json');
  if (!existsSync(path)) return [];
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const next = manifest.dependencies?.next;
  return next ? [{ app, path, next }] : [];
});

describe('Next.js security baseline', () => {
  it('discovers the Next applications', () => {
    expect(nextApps.length).toBeGreaterThan(0);
  });

  it('accepts only the patched 16.4.1 runtime', () => {
    expect(isPatchedNextRuntime('16.4.1')).toBe(true);
    for (const version of [
      '16.3.8',
      '16.4.0',
      '16.4.2',
      '16.4.10',
      '16.5.0',
      '15.5.27',
      '15.5.28',
      '17.0.0',
      '17.0.1',
      '16.4.1-canary.0',
    ]) {
      expect(isPatchedNextRuntime(version), version).toBe(false);
    }
  });

  for (const { app, path, next } of nextApps) {
    it(`${app} pins and installs the patched 16.4.1 runtime`, () => {
      expect(isPatchedNextRuntime(next)).toBe(true);
      const appRequire = createRequire(path);
      expect(appRequire('next/package.json').version).toBe(next);
    });
  }
});
