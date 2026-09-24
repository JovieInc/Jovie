import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  resolveAppContentPath,
  resolveAppWebRoot,
  resolveMonorepoRoot,
} from '@/lib/filesystem-paths';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

describe('filesystem-paths', () => {
  it('resolves the app root from a monorepo cwd', () => {
    const cwd = '/workspace/jovie';
    const existingPaths = new Set([
      path.join(cwd, 'turbo.json'),
      path.join(cwd, 'apps', 'web', 'package.json'),
      path.join(cwd, 'apps', 'web', 'content'),
    ]);

    const exists = (candidatePath: string): boolean =>
      existingPaths.has(path.resolve(candidatePath));

    expect(resolveAppWebRoot(cwd, exists)).toBe(path.join(cwd, 'apps', 'web'));
    expect(resolveMonorepoRoot(cwd, exists)).toBe(cwd);
  });

  it('resolves the app root when the cwd is already the app workspace', () => {
    const cwd = '/workspace/jovie/apps/web';
    const existingPaths = new Set([
      path.join(cwd, 'package.json'),
      path.join(cwd, 'content'),
    ]);

    const exists = (candidatePath: string): boolean =>
      existingPaths.has(path.resolve(candidatePath));

    expect(resolveAppWebRoot(cwd, exists)).toBe(cwd);
    expect(resolveMonorepoRoot(cwd, exists)).toBe(cwd);
  });

  it('keeps the injected-predicate fallback anchored to the current app cwd', () => {
    expect(resolveAppWebRoot('/workspace/missing', () => false)).toBe(
      process.cwd()
    );
  });

  it('resolves legal content inside the app content root', () => {
    expect(resolveAppContentPath('legal/cookies.md')).toMatch(
      /apps\/web\/content\/legal\/cookies\.md$/
    );
  });

  it('resolves shared content from the independently deployed Ovie workspace', () => {
    const cwd = '/workspace/jovie/apps/ovie';
    const existingPaths = new Set([
      '/workspace/jovie/turbo.json',
      '/workspace/jovie/apps/web/package.json',
      '/workspace/jovie/apps/web/content',
    ]);
    const exists = (candidatePath: string) => existingPaths.has(candidatePath);
    expect(resolveAppWebRoot(cwd, exists)).toBe('/workspace/jovie/apps/web');
    expect(resolveMonorepoRoot(cwd, exists)).toBe('/workspace/jovie');
  });

  it.each([
    {
      cwd: '/workspace/jovie',
      appWebRoot: '/workspace/jovie/apps/web',
      monorepoRoot: '/workspace/jovie',
    },
    {
      cwd: '/workspace/jovie/apps/web',
      appWebRoot: '/workspace/jovie/apps/web',
      monorepoRoot: '/workspace/jovie',
    },
    {
      cwd: '/workspace/jovie/apps/ovie',
      appWebRoot: '/workspace/jovie/apps/web',
      monorepoRoot: '/workspace/jovie',
    },
    {
      cwd: '/var/task/apps/web',
      appWebRoot: '/var/task/apps/web',
      monorepoRoot: '/var/task',
    },
  ])('resolves roots from $cwd without filesystem probing', roots => {
    expect(resolveAppWebRoot(roots.cwd)).toBe(roots.appWebRoot);
    expect(resolveMonorepoRoot(roots.cwd)).toBe(roots.monorepoRoot);
  });

  it('does not mistake a similarly named app directory for the web app', () => {
    const cwd = '/workspace/jovie/apps/website';

    expect(resolveAppWebRoot(cwd)).toBe(path.join(cwd, 'apps', 'web'));
    expect(resolveMonorepoRoot(cwd)).toBe(cwd);
  });

  it('rejects path traversal when resolving content paths', () => {
    expect(() => resolveAppContentPath('../private.md')).toThrow();
  });

  it('keeps filesystem root discovery from tracing sibling source files', async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'jovie-root-trace-'));
    const fixtureAppRoot = path.join(fixtureRoot, 'apps', 'web');
    const trapFile = path.join(fixtureAppRoot, 'lib', 'unrelated.ts');
    const runtimeData = path.join(
      fixtureAppRoot,
      'content',
      'runtime-data.json'
    );
    const runtimeReader = path.join(fixtureAppRoot, 'runtime-reader.cjs');
    const traceScript = path.join(fixtureRoot, 'trace-fixture.cjs');
    const helperBundle = path.join(
      fixtureAppRoot,
      '.next',
      'filesystem-paths.mjs'
    );

    try {
      mkdirSync(path.dirname(trapFile), { recursive: true });
      mkdirSync(path.join(fixtureAppRoot, 'content'), { recursive: true });
      writeFileSync(path.join(fixtureRoot, 'turbo.json'), '{}');
      writeFileSync(path.join(fixtureAppRoot, 'package.json'), '{}');
      writeFileSync(trapFile, 'export const unrelated = true;');
      writeFileSync(runtimeData, '{"source":"fixture"}');
      writeFileSync(
        runtimeReader,
        `const { readFileSync } = require('node:fs');
const { join } = require('node:path');
readFileSync(join(__dirname, 'content', 'runtime-data.json'), 'utf8');
`
      );
      writeFileSync(
        traceScript,
        `const { createRequire } = require('node:module');
const path = require('node:path');
const repoRoot = ${JSON.stringify(repoRoot)};
const fixtureRoot = ${JSON.stringify(fixtureRoot)};
const fixtureAppRoot = ${JSON.stringify(fixtureAppRoot)};
const appRequire = createRequire(path.join(repoRoot, 'apps/web/package.json'));
const nextRequire = createRequire(appRequire.resolve('next/package.json'));
const vitestRequire = createRequire(appRequire.resolve('vitest/package.json'));
const esbuild = vitestRequire('esbuild');
const { nodeFileTrace } = nextRequire('@vercel/nft');
const helperSource = path.join(repoRoot, 'apps/web/lib/filesystem-paths.ts');
const helperBundle = ${JSON.stringify(helperBundle)};
const runtimeReader = ${JSON.stringify(runtimeReader)};

async function main() {
  await esbuild.build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [helperSource],
    format: 'esm',
    logLevel: 'silent',
    outfile: helperBundle,
    packages: 'external',
    platform: 'node',
    tsconfig: path.join(repoRoot, 'apps/web/tsconfig.json'),
  });
  const trace = await nodeFileTrace([helperBundle, runtimeReader], {
    base: fixtureRoot,
    mixedModules: true,
    processCwd: fixtureAppRoot,
  });
  process.stdout.write(JSON.stringify([...trace.fileList]));
}

main().catch(error => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
`
      );

      const result = spawnSync(process.execPath, [traceScript], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      });
      expect(result.status, result.stderr).toBe(0);
      const tracedFiles = JSON.parse(result.stdout) as string[];

      expect(tracedFiles).toContain('apps/web/.next/filesystem-paths.mjs');
      expect(tracedFiles).toContain('apps/web/runtime-reader.cjs');
      expect(tracedFiles).toContain('apps/web/content/runtime-data.json');
      expect(tracedFiles).not.toContain(path.relative(fixtureRoot, trapFile));
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
