import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  writeBuildDeployedAt,
  resolveBuildStampMs,
} = require('./write-build-deployed-at.cjs');

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { force: true, recursive: true });
});

describe('writeBuildDeployedAt', () => {
  it('writes the injected build clock once, not a later request time', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'build-deployed-at-'));
    roots.push(root);
    const outputPath = path.join(root, 'build-deployed-at.generated.ts');
    const buildStart = 1_762_000_000_000;

    const written = writeBuildDeployedAt({
      outputPath,
      vercelDeploymentTime: '',
      buildDeployedAt: '',
      nowMs: () => buildStart,
    });
    const source = readFileSync(outputPath, 'utf8');

    expect(written).toBe(buildStart);
    expect(source).toContain(
      `export const BUILD_DEPLOYED_AT_MS: number | null = ${buildStart};`
    );
    expect(source).not.toMatch(/Date\.now\s*\(/);
  });

  it('uses the deploy env when next build calls it without a clock', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'build-deployed-at-'));
    roots.push(root);
    const outputPath = path.join(root, 'build-deployed-at.generated.ts');
    const previousVercel = process.env.VERCEL_DEPLOYMENT_TIME;
    const previousBuild = process.env.JOVIE_BUILD_DEPLOYED_AT;
    process.env.VERCEL_DEPLOYMENT_TIME = '';
    process.env.JOVIE_BUILD_DEPLOYED_AT = '1762000000000';

    try {
      expect(writeBuildDeployedAt({ outputPath })).toBe(1_762_000_000_000);
    } finally {
      if (previousVercel == null) delete process.env.VERCEL_DEPLOYMENT_TIME;
      else process.env.VERCEL_DEPLOYMENT_TIME = previousVercel;
      if (previousBuild == null) delete process.env.JOVIE_BUILD_DEPLOYED_AT;
      else process.env.JOVIE_BUILD_DEPLOYED_AT = previousBuild;
    }
  });

  it('keeps an explicit deployment time instead of calling the clock', () => {
    let calls = 0;
    const stamp = resolveBuildStampMs({
      vercelDeploymentTime: '2020-01-02T03:04:05.000Z',
      buildDeployedAt: '',
      nowMs: () => {
        calls += 1;
        return 1_700_000_000_000;
      },
    });

    expect(stamp).toBe(Date.parse('2020-01-02T03:04:05.000Z'));
    expect(calls).toBe(0);
  });
});

describe('build deployedAt stamp is shipped to the Vercel build', () => {
  it('is not excluded by .vercelignore', () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../..'
    );
    const ignore = readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8');
    expect(ignore).toContain('!apps/web/scripts/write-build-deployed-at.cjs');
  });

  it('does not rewrite the committed stamp when next.config is loaded', () => {
    const committed = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../lib/observability/build-deployed-at.generated.ts'
    );
    const before = readFileSync(committed, 'utf8');
    require('../next.config.js');
    expect(readFileSync(committed, 'utf8')).toBe(before);
    expect(before).toContain('= null;');
  });
});
