import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

  // GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r.
  // Next 16.3.8 fixed September advisories but is affected by the October ones.
  for (const { app, path, next } of nextApps) {
    it(`${app} pins and installs a stable runtime with the October 2026 fixes`, () => {
      expect(next).toMatch(/^\d+\.\d+\.\d+$/);
      const [major, minor, patch] = next.split('.').map(Number);
      expect(
        major > 16 ||
          (major === 16 && (minor > 4 || (minor === 4 && patch >= 1)))
      ).toBe(true);
      const appRequire = createRequire(path);
      expect(appRequire('next/package.json').version).toBe(next);
    });
  }
});
