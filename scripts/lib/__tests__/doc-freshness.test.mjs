import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Lets a test make one directory vanish mid-walk, the way parallel CI
// commands delete apps/web/coverage while doc:freshness:check runs.
const vanishing = vi.hoisted(() => ({ dir: null }));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal();
  return {
    ...fs,
    readdirSync: (path, options) => {
      if (vanishing.dir && String(path) === vanishing.dir) {
        const error = new Error(
          `ENOENT: no such file or directory, scandir '${path}'`
        );
        error.code = 'ENOENT';
        throw error;
      }
      return fs.readdirSync(path, options);
    },
  };
});

import {
  applyGardeningFixes,
  countAgentsMapLines,
  expandDocScopes,
  findBrokenCrossLinks,
  findStaleFreshnessMarkers,
  loadDocFreshnessRegistry,
  runDocFreshnessLint,
} from '../doc-freshness.mjs';

const tempDirs = [];

function makeRepo(structure) {
  const root = mkdtempSync(join(tmpdir(), 'doc-freshness-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(structure)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  }

  return root;
}

afterEach(() => {
  vanishing.dir = null;
  tempDirs.length = 0;
});

describe('doc-freshness registry', () => {
  it('loads the checked-in registry', () => {
    const registry = loadDocFreshnessRegistry();
    expect(registry.schemaVersion).toBe(1);
    expect(registry.agentsMap.maxLines).toBe(120);
  });

  it('passes on the current repository docs', () => {
    const registry = loadDocFreshnessRegistry();
    const result = runDocFreshnessLint(registry);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('detects broken cross-links with remediation text', () => {
    const repoRoot = makeRepo({
      'docs/a.md': '[rule](./missing.md)\n',
    });
    const violations = findBrokenCrossLinks(['docs/a.md'], repoRoot);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('broken-link');
    expect(violations[0].remediation).toContain('pnpm doc:freshness:check');
  });

  it('detects stale freshness markers outside gardening scope', () => {
    const repoRoot = makeRepo({
      'CLAUDE.md': '<!-- doc-freshness:scoped-rules-count:1 -->\n',
      '.claude/rules/a.md': '# a\n',
      '.claude/rules/b.md': '# b\n',
    });
    const registry = {
      agentsMap: { path: 'CLAUDE.md', maxLines: 120 },
      crossLinkScopes: [],
      computers: {
        'scoped-rules-count': {
          type: 'globCount',
          pattern: '.claude/rules/*.md',
        },
      },
      freshnessMarkers: [
        {
          id: 'scoped-rules-count',
          files: ['CLAUDE.md'],
          computer: 'scoped-rules-count',
        },
      ],
    };

    const violations = findStaleFreshnessMarkers(registry, { repoRoot });
    expect(violations).toHaveLength(1);
    expect(violations[0].actual).toBe('2');
  });

  it('auto-fixes gardening-only stale markers', () => {
    const repoRoot = makeRepo({
      'docs/doc-gardening/SEED-STALE.md':
        'count **12** files\n<!-- doc-freshness:scoped-rules-count:12 -->\n',
      '.claude/rules/a.md': '# a\n',
      '.claude/rules/b.md': '# b\n',
    });

    const violations = [
      {
        kind: 'stale-marker',
        file: 'docs/doc-gardening/SEED-STALE.md',
        id: 'scoped-rules-count',
        expected: '12',
        actual: '2',
        gardeningOnly: true,
      },
    ];

    const fixes = applyGardeningFixes(violations, repoRoot);
    expect(fixes).toHaveLength(1);
    const updated = readFileSync(
      join(repoRoot, 'docs/doc-gardening/SEED-STALE.md'),
      'utf8'
    );
    expect(updated).toContain('<!-- doc-freshness:scoped-rules-count:2 -->');
  });

  it('fails when AGENTS map exceeds the line budget', () => {
    const lines = Array.from({ length: 130 }, (_, index) => `line ${index}`);
    const repoRoot = makeRepo({
      'CLAUDE.md': `${lines.join('\n')}\n`,
    });
    const registry = {
      agentsMap: { path: 'CLAUDE.md', maxLines: 120 },
      crossLinkScopes: [],
      freshnessMarkers: [],
      computers: {},
    };

    expect(countAgentsMapLines(registry, repoRoot)).toBe(131);
    const result = runDocFreshnessLint(registry, { repoRoot });
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe('agents-map-too-long');
  });

  it('expands scoped globs for cross-link scanning', () => {
    const repoRoot = makeRepo({
      '.claude/rules/a.md': '# a\n',
      '.claude/rules/b.md': '# b\n',
    });
    const files = expandDocScopes(['.claude/rules/*.md'], repoRoot);
    expect(files).toEqual(['.claude/rules/a.md', '.claude/rules/b.md']);
  });

  it('skips a directory deleted by a parallel command mid-walk', () => {
    const repoRoot = makeRepo({
      '.claude/rules/a.md': '# a\n',
      'apps/web/coverage/lcov-report/index.html': '<html></html>\n',
    });
    vanishing.dir = join(repoRoot, 'apps/web/coverage');
    const files = expandDocScopes(['.claude/rules/*.md'], repoRoot);
    expect(files).toEqual(['.claude/rules/a.md']);
  });

  it('still fails on directory read errors other than ENOENT', () => {
    const repoRoot = makeRepo({ '.claude/rules/a.md': '# a\n' });
    expect(() =>
      expandDocScopes(['*.md'], join(repoRoot, '.claude/rules/a.md'))
    ).toThrow(/ENOTDIR/);
  });
});
