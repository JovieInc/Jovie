import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCheckedInScriptsOnly,
  collectRuntimeImports,
  extractJobBlock,
  listNodeEntries,
  SKIP_DEPS_JOBS,
  validateSkipDepsJob,
  validateSkipDepsWorkflows,
} from '../ci-skip-deps-jobs.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const scratch = [];

afterEach(() => {
  for (const dir of scratch.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-skip-deps-'));
  scratch.push(root);
  return root;
}

describe('skip-deps job allowlist', () => {
  it('lists only the aggregator and receipt jobs, each once', () => {
    const ids = SKIP_DEPS_JOBS.map(job => `${job.workflow}:${job.id}`);
    expect(ids).toEqual([
      '.github/workflows/source-validation.yml:ready',
      '.github/workflows/ci.yml:ci-pr-ready',
      '.github/workflows/ci.yml:ci-merge-group-ready',
      '.github/workflows/ci.yml:ci-fast',
      '.github/workflows/ci.yml:ci-product-lane-receipt',
      '.github/workflows/ci.yml:ci-merge-suite-scope',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not list ci-fast shard workers that still need dependencies', () => {
    const ids = new Set(SKIP_DEPS_JOBS.map(job => job.id));
    for (const id of [
      'ci-fast-typecheck',
      'ci-fast-remaining',
      'ci-profile-admission-browser',
      'ci-fast-structural-python',
      'ci-fast-structural-web',
      'ci-fast-structural-lanes',
    ]) {
      expect(ids.has(id), id).toBe(false);
    }
  });

  it('accepts the live skip-deps jobs and the scripts they invoke', () => {
    const findings = validateSkipDepsWorkflows(REPO_ROOT);
    expect(findings.map(item => item.id)).toEqual(
      SKIP_DEPS_JOBS.map(job => job.id)
    );
    for (const finding of findings) {
      expect(finding.errors, finding.id).toEqual([]);
    }
    const receipt = findings.find(
      item => item.id === 'ci-product-lane-receipt'
    );
    expect(receipt.entries).toContain('scripts/lib/ci-skip-deps-jobs.mjs');
    expect(receipt.entries).toContain('scripts/lib/product-lane-finalize.mjs');
    const sourceReady = findings.find(item => item.id === 'ready');
    expect(sourceReady.entries).toContain('packages/api-client/cli.ts');
    const { external } = collectRuntimeImports(
      'packages/api-client/cli.ts',
      REPO_ROOT
    );
    expect(external).toEqual([]);
  });

  it('fails loudly when a skip-deps script imports a package', () => {
    const root = fixtureRepo();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(
      join(root, 'scripts', 'bad.mjs'),
      "import { load } from 'js-yaml';\nexport const parse = load;\n"
    );
    expect(() => assertCheckedInScriptsOnly('scripts/bad.mjs', root)).toThrow(
      /imports a node_modules package \(fails loudly\).*js-yaml/
    );
  });

  it('fails when an allowlisted job restores node_modules or calls setup-node-pnpm', () => {
    const poisoned = [
      '  ci-fast:',
      '    name: ci-fast',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: ./.github/actions/setup-node-pnpm',
      '      - run: echo ok',
    ].join('\n');
    const result = validateSkipDepsJob(
      poisoned,
      { id: 'ci-fast', name: 'ci-fast' },
      REPO_ROOT
    );
    expect(result.errors.join('\n')).toMatch(/setup-node-pnpm/);
  });

  it('extracts exact job ids so ci-fast shards are not mistaken for the aggregator', () => {
    const workflow = [
      'jobs:',
      '  ci-fast-typecheck:',
      '    name: ci-fast (typecheck)',
      '  ci-fast:',
      '    name: ci-fast',
      '  ci-fast-remaining:',
      '    name: ci-fast (remaining)',
    ].join('\n');
    const block = extractJobBlock(workflow, 'ci-fast');
    expect(block).toContain('name: ci-fast');
    expect(block).not.toContain('typecheck');
    expect(block).not.toContain('remaining');
  });

  it('lists checked-in node entries from run steps and ignores flags', () => {
    const entries = listNodeEntries(`
      - run: node scripts/lib/ci-skip-deps-jobs.mjs --assert scripts/lib/product-lane-finalize.mjs
      - run: node packages/api-client/cli.ts gh -- api
      - run: node --input-type=module scripts/lib/product-lane-finalize.mjs
      - run: runs="$(node packages/api-client/cli.ts gh -- api)"
      - run: echo "| Pen Diff | $PEN_DIFF_RESULT | node scripts/invariants/pen-diff.mjs |"
    `);
    expect(entries).toEqual([
      'scripts/lib/ci-skip-deps-jobs.mjs',
      'packages/api-client/cli.ts',
      'scripts/lib/product-lane-finalize.mjs',
    ]);
  });
});
