import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { selectHighRiskSources } from '../mutation-diff.mjs';

const REPO = resolve(import.meta.dirname, '../../..');
const appRequire = createRequire(join(REPO, 'apps/web/package.json'));
const coreRequire = createRequire(appRequire.resolve('@stryker-mutator/core'));

it.each([
  'export { allowed } from "./policy";',
  'export { default as allowed } from "./policy";',
  'export * from "./policy";',
  'export * as policy from "./policy";',
  'export { type Actor } from "./actor";',
  'export {} from "./setup";',
  'export interface Actor { id: string }; export * from "./policy";',
])('excludes static wiring from mutation candidates: %s', contents => {
  expect(
    selectHighRiskSources(['packages/ui/index.ts'], () => contents, {
      prefixes: null,
      root: 'packages/ui',
    })
  ).toEqual([]);
});

it.each([
  'export * from "./policy"; export const allowed = true;',
  'export * from "./policy"; export function allowed() { return true; }',
  'export * from "./policy"; export class Actor {}',
  'export * from "./policy"; import "./setup";',
  'export * from "./policy"; import { allowed } from "./setup";',
  'export * from "./policy"; void 0;',
  'export * from "./policy"; export default true;',
  'export * from "./policy"; export = policy;',
  'export * from "./policy"; export type Broken = ;',
  null,
])('retains runtime or uncertain index source: %s', contents => {
  expect(
    selectHighRiskSources(['packages/ui/index.ts'], () => contents, {
      prefixes: null,
      root: 'packages/ui',
    })
  ).toEqual(['index.ts']);
});

it('proves the real UI barrels generate no mutants with an executable control', async () => {
  const { Instrumenter } = await import(
    coreRequire.resolve('@stryker-mutator/instrumenter')
  );
  const logger = {
    debug() {},
    info() {},
    trace() {},
    warn() {},
    error() {},
    isDebugEnabled: () => false,
  };
  const sources = ['packages/ui/index.ts', 'packages/ui/atoms/index.ts'].map(
    name => ({ name, content: readFileSync(join(REPO, name), 'utf8') })
  );
  sources.push({
    name: 'runtime-control.ts',
    content:
      'export const allowed = true; export const score = (n: number) => n > 0;',
  });
  for (const [index, source] of sources.entries()) {
    const result = await new Instrumenter(logger).instrument(
      [{ ...source, mutate: true }],
      { plugins: null, ignorers: [], excludedMutations: [] }
    );
    if (index < 2) {
      expect(result.mutants).toHaveLength(0);
      expect(
        selectHighRiskSources([source.name], () => source.content, {
          prefixes: null,
          root: 'packages/ui',
        })
      ).toEqual([]);
    } else expect(result.mutants.length).toBeGreaterThan(0);
  }
});

it('the actual sweep omits barrels, retains runtime, and preserves existing state', () => {
  const root = mkdtempSync(join(tmpdir(), 'mutation-source-'));
  /** @param {string} path @param {string} content */
  const put = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const copied = new Set();
  /** @param {string} path */
  const copyModule = path => {
    if (copied.has(path)) return;
    copied.add(path);
    const content = readFileSync(join(REPO, path), 'utf8');
    put(path, content);
    for (const match of content.matchAll(
      /(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/gu
    )) {
      const child = resolve(dirname(join(REPO, path)), match[2]).slice(
        REPO.length + 1
      );
      if (/\.(mjs|ts)$/u.test(child)) copyModule(child);
    }
  };
  try {
    copyModule('scripts/mutation-sweep.mjs');
    put(
      'scripts/mutation-score-baseline.json',
      JSON.stringify({
        schemaVersion: 1,
        direction: 'lock_up',
        files: {},
      })
    );
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
    put('packages/ui/index.ts', 'export * from "./atoms/source";');
    put('packages/ui/atoms/source.ts', 'export const allowed = true;');
    put('packages/ui/source.test.ts', 'import { allowed } from "./index";');
    put(
      'state.json',
      JSON.stringify({
        schemaVersion: 1,
        modules: {
          'packages/ui/index.ts': {
            status: 'error',
            score: null,
            blob: 'old-proof',
          },
        },
      })
    );
    const before = readFileSync(join(root, 'state.json'), 'utf8');
    const run = spawnSync(
      process.execPath,
      [
        'scripts/mutation-sweep.mjs',
        '--files',
        'packages/ui/index.ts,packages/ui/atoms/source.ts',
        '--state',
        'state.json',
        '--list-only',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('1 candidate modules;');
    expect(run.stdout).toContain('packages/ui/atoms/source.ts');
    expect(run.stdout).not.toContain('packages/ui/index.ts');
    expect(readFileSync(join(root, 'state.json'), 'utf8')).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
