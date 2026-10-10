import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Lets a test make one directory vanish mid-walk, the way parallel CI
// commands delete apps/web/coverage while doc:freshness:check runs.
const vanishing = vi.hoisted(() => ({ dir: null }));
vi.mock('node:fs', async importOriginal => {
  /** @type {typeof import('node:fs')} */
  const fs = await importOriginal();
  return {
    ...fs,
    readdirSync: (path, options) => {
      if (vanishing.dir && String(path) === vanishing.dir) {
        throw Object.assign(
          new Error(`ENOENT: no such file or directory, scandir '${path}'`),
          { code: 'ENOENT' }
        );
      }
      return fs.readdirSync(path, options);
    },
  };
});

import {
  applyGardeningFixes,
  countAgentsMapLines,
  expandDocScopes,
  extractMarkdownLinks,
  findBrokenCrossLinks,
  findStaleFreshnessMarkers,
  loadDocFreshnessRegistry,
  runDocFreshnessLint,
  topMapDocuments,
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
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
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

import {
  documentDigest,
  documentOwners,
  readDocumentSource,
} from '../doc-review.mjs';

function reviewedRepo() {
  const repoRoot = makeRepo({
    'CLAUDE.md': '# Map\n[Guide](docs/guide.md)\n',
    'docs/guide.md': '# Guide\nRequires 24.21.0\n',
    '.github/CODEOWNERS': '* @owner\n/docs/ @docs\n',
    'source.json': '{"runtime":{"node":"24.21.0"},"unrelated":1}',
  });
  const registry = {
    agentsMap: { path: 'CLAUDE.md', maxLines: 120 },
    crossLinkScopes: [],
    freshnessMarkers: [],
    documentReviews: {},
  };
  for (const file of ['CLAUDE.md', 'docs/guide.md']) {
    const source = { path: 'source.json', pointer: '/runtime/node' };
    registry.documentReviews[file] = {
      owner: file === 'CLAUDE.md' ? '@owner' : '@docs',
      claim: 'Node runtime is pinned by the source manifest.',
      documentSha256: documentDigest(
        readFileSync(join(repoRoot, file), 'utf8')
      ),
      sources: [
        {
          ...source,
          sha256: documentDigest(readDocumentSource(source, repoRoot)),
        },
      ],
    };
  }
  registry.documentReviews['docs/guide.md'].sources[0].documentValue =
    '24.21.0';
  return { repoRoot, registry };
}

function reviewKinds(registry, repoRoot) {
  return runDocFreshnessLint(registry, {
    repoRoot,
  }).qualification.violations.map(v => v.kind);
}

describe('top-map source reviews', () => {
  it('keeps new review findings nonblocking while existing map limits still fail', () => {
    const { repoRoot, registry } = reviewedRepo();
    delete registry.documentReviews;
    const shadow = runDocFreshnessLint(registry, { repoRoot });
    expect(shadow.ok).toBe(true);
    expect(shadow.violations).toEqual([]);
    expect(shadow.qualification.mode).toBe('qualification-only');
    expect(shadow.qualification.ok).toBe(false);
    expect(shadow.qualification.violations[0].kind).toBe(
      'missing-document-reviews'
    );
    expect(shadow.qualification.durationMs).toBeGreaterThanOrEqual(0);
    registry.agentsMap.maxLines = 0;
    const blocked = runDocFreshnessLint(registry, { repoRoot });
    expect(blocked.ok).toBe(false);
    expect(blocked.violations[0].kind).toBe('agents-map-too-long');
    expect(blocked.qualification.ok).toBe(false);
  });

  it('derives the exact map, including scoped rules and added links', () => {
    const { repoRoot, registry } = reviewedRepo();
    expect(reviewKinds(registry, repoRoot)).toEqual([]);
    mkdirSync(join(repoRoot, '.claude/rules'), { recursive: true });
    writeFileSync(join(repoRoot, '.claude/rules/new.md'), '# New');
    writeFileSync(join(repoRoot, 'docs/next.md'), '# Next');
    writeFileSync(
      join(repoRoot, 'CLAUDE.md'),
      '# Map\n[Guide](docs/guide.md)\n[New](docs/next.md)'
    );
    expect(topMapDocuments(registry, repoRoot)).toEqual([
      '.claude/rules/new.md',
      'CLAUDE.md',
      'docs/guide.md',
      'docs/next.md',
    ]);
    expect(
      reviewKinds(registry, repoRoot).filter(
        k => k === 'missing-document-review'
      )
    ).toHaveLength(2);
    delete registry.documentReviews;
    expect(reviewKinds(registry, repoRoot)).toContain(
      'missing-document-reviews'
    );
  });

  it('fails a stale document and missing owner, source, claim or mapped entry', () => {
    const { repoRoot, registry } = reviewedRepo();
    const review = registry.documentReviews['docs/guide.md'];
    review.owner = '@unknown';
    review.claim = '';
    review.sources = [];
    writeFileSync(join(repoRoot, 'docs/guide.md'), '# Changed');
    registry.documentReviews['docs/orphan.md'] = review;
    expect(reviewKinds(registry, repoRoot)).toEqual(
      expect.arrayContaining([
        'stale-document-review',
        'invalid-document-owner',
        'missing-review-claim',
        'missing-document-source',
        'unmapped-document-review',
      ])
    );
    rmSync(join(repoRoot, 'docs/guide.md'));
    expect(reviewKinds(registry, repoRoot)).toContain(
      'missing-review-document'
    );
    rmSync(join(repoRoot, '.github/CODEOWNERS'));
    expect(reviewKinds(registry, repoRoot)).toContain('invalid-document-owner');
  });

  it('requires source review after a relevant fact changes, even if prose is unchanged', () => {
    const { repoRoot, registry } = reviewedRepo();
    writeFileSync(
      join(repoRoot, 'source.json'),
      '{"runtime":{"node":"25.0.0"},"unrelated":1}'
    );
    expect(reviewKinds(registry, repoRoot)).toContain('stale-document-source');
    expect(reviewKinds(registry, repoRoot)).toContain('document-claim-drift');
    // Updating the digest alone cannot make a false concrete claim pass.
    const source = registry.documentReviews['docs/guide.md'].sources[0];
    source.sha256 = documentDigest(readDocumentSource(source, repoRoot));
    expect(reviewKinds(registry, repoRoot)).toContain('document-claim-drift');
    writeFileSync(
      join(repoRoot, 'source.json'),
      '{"runtime":{"node":"24.21.0"},"unrelated":2}'
    );
    source.sha256 = documentDigest(readDocumentSource(source, repoRoot));
    expect(reviewKinds(registry, repoRoot)).toEqual([]);
  });

  it('fails missing, invalid, external, and self-referential source evidence', () => {
    const { repoRoot, registry } = reviewedRepo();
    const review = registry.documentReviews['docs/guide.md'];
    for (const source of [
      null,
      { path: 'missing' },
      { path: 'source.json', pointer: '/missing' },
      { path: 'docs/../docs/guide.md' },
      { path: 'source.json', section: 'bad' },
      { path: '/etc/hosts' },
    ]) {
      review.sources = [source];
      expect(reviewKinds(registry, repoRoot)).toContain(
        'invalid-document-source'
      );
    }
    symlinkSync('/etc/hosts', join(repoRoot, 'external'));
    review.sources = [{ path: 'external' }];
    expect(reviewKinds(registry, repoRoot)).toContain(
      'invalid-document-source'
    );
    review.sources = [
      { path: 'source.json', pointer: '/runtime/node/missing' },
    ];
    expect(reviewKinds(registry, repoRoot)).toContain(
      'invalid-document-source'
    );
  });

  it('selects exact Markdown sections and rejects ambiguous or missing headings', () => {
    const { repoRoot } = reviewedRepo();
    writeFileSync(
      join(repoRoot, 'source.md'),
      '# Source\n## Contract\nA\n### Detail\nB\n## Other\nC'
    );
    const source = { path: 'source.md', section: '## Contract' };
    expect(readDocumentSource(source, repoRoot)).toBe(
      '## Contract\nA\n### Detail\nB'
    );
    writeFileSync(
      join(repoRoot, 'source.md'),
      '## Contract\nA\n## Other\nCHANGED'
    );
    expect(readDocumentSource(source, repoRoot)).toBe('## Contract\nA');
    for (const text of ['## Missing', '## Contract\nA\n## Contract\nB']) {
      writeFileSync(join(repoRoot, 'source.md'), text);
      expect(() => readDocumentSource(source, repoRoot)).toThrow(
        /exactly once/
      );
    }
    expect(documentDigest('a\r\nb')).toBe(documentDigest('a\nb'));
  });

  it('rejects whole high-churn manifests and supports escaped JSON pointer keys', () => {
    const { repoRoot } = reviewedRepo();
    writeFileSync(join(repoRoot, 'package.json'), '{"a/b":{"~key":"value"}}');
    expect(() =>
      readDocumentSource({ path: 'package.json' }, repoRoot)
    ).toThrow(/whole file/);
    expect(
      readDocumentSource(
        { path: 'package.json', pointer: '/a~1b/~0key' },
        repoRoot
      )
    ).toBe('"value"');
    mkdirSync(join(repoRoot, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.github/workflows/example.yml'),
      'name: Example'
    );
    expect(() =>
      readDocumentSource({ path: './.github/workflows/example.yml' }, repoRoot)
    ).toThrow(/whole file/);
    expect(() => readDocumentSource({ path: '.' }, repoRoot)).toThrow(
      /file inside/
    );
    expect(() => readDocumentSource({ path: '' }, repoRoot)).toThrow(
      /relative/
    );
  });

  it('uses the last matching CODEOWNERS owner and refuses unsupported ownership syntax', () => {
    const rules =
      '* @all\n/docs/ @docs\n/docs/*.md @markdown\n/docs/nested/** @nested';
    expect(documentOwners('docs/a.md', rules)).toEqual(['@markdown']);
    expect(documentOwners('docs/nested/a.md', rules)).toEqual(['@nested']);
    expect(documentOwners('CLAUDE.md', rules)).toEqual(['@all']);
    expect(documentOwners('docs/a.md', '* @all\n[abc] @unknown')).toEqual([]);
    expect(documentOwners('a.md', '# comment\n\n*.md @doc')).toEqual(['@doc']);
    expect(documentOwners('a.md', '*')).toEqual([]);
    expect(
      documentOwners('docs/a.md', '* @all\n/docs/**/a.md @nested')
    ).toEqual(['@nested']);
    expect(
      documentOwners('docs/deep/a.md', '* @all\n/docs/**/a.md @nested')
    ).toEqual(['@nested']);
  });
});

describe('top-map reference links and source selectors', () => {
  it('includes full, collapsed and shortcut Markdown references in the required set', () => {
    const { repoRoot, registry } = reviewedRepo();
    writeFileSync(
      join(repoRoot, 'CLAUDE.md'),
      '# Map\n[Guide][g] [next][] [last]\n[g]: docs/guide.md\n[next]: docs/next.md\n[last]: docs/last.md\n[unused]: docs/unused.md'
    );
    expect(topMapDocuments(registry, repoRoot)).toEqual([
      'CLAUDE.md',
      'docs/guide.md',
      'docs/last.md',
      'docs/next.md',
    ]);
    expect(
      reviewKinds(registry, repoRoot).filter(
        k => k === 'missing-document-review'
      )
    ).toHaveLength(2);
  });
  it('rejects ambiguous source selectors and stale prose even when the source is unchanged', () => {
    const { repoRoot, registry } = reviewedRepo();
    expect(() =>
      readDocumentSource(
        { path: 'source.json', pointer: '/runtime', section: '## Section' },
        repoRoot
      )
    ).toThrow(/exactly one/);
    writeFileSync(join(repoRoot, 'docs/guide.md'), '# Wrong version');
    registry.documentReviews['docs/guide.md'].documentSha256 =
      documentDigest('# Wrong version');
    expect(reviewKinds(registry, repoRoot)).toContain('document-claim-drift');
  });
  it('does not treat owners mentioned in comments as assignments', () => {
    expect(documentOwners('a.md', '* @owner # @other')).toEqual(['@owner']);
  });
});

describe('Markdown examples are not top-map links', () => {
  it('ignores fenced examples, including longer fences and unclosed blocks', () => {
    const content = [
      '[real](docs/real.md)',
      '```md',
      '[fake](docs/fake.md)',
      '[fake ref]',
      '[fake ref]: docs/fake-ref.md',
      '```',
      '~~~~',
      '[another](docs/another.md)',
      '~~~',
      '[still](docs/still.md)',
      '~~~~~',
      '[real ref]',
      '[real ref]: docs/real-ref.md',
      '```',
      '[unclosed](docs/unclosed.md)',
    ].join('\n');
    expect(
      extractMarkdownLinks(content, 'CLAUDE.md').map(link => link.target)
    ).toEqual(['docs/real.md', 'docs/real-ref.md']);
  });
  it('normalizes repeated whitespace and case in reference labels', () => {
    const links = extractMarkdownLinks(
      '[Guide][the  guide]\n[THE   GUIDE]: docs/guide.md',
      'CLAUDE.md'
    );
    expect(links.map(link => link.target)).toEqual(['docs/guide.md']);
  });
});

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

it('gardening commits and pushes with no runner Git identity, without changing local configuration', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'jovie-gardening-identity-'));
  try {
    const root = join(temporary, 'repo');
    const remote = join(temporary, 'remote.git');
    const bin = join(temporary, 'bin');
    for (const path of ['scripts/lib', 'docs/doc-gardening', '.claude/rules']) {
      mkdirSync(join(root, path), { recursive: true });
    }
    mkdirSync(bin);
    for (const path of [
      'scripts/doc-gardening-agent.mjs',
      'scripts/lib/doc-freshness.mjs',
      'scripts/lib/doc-review.mjs',
    ]) {
      copyFileSync(join(sourceRoot, path), join(root, path));
    }
    writeFileSync(join(root, 'CLAUDE.md'), '# Fixture\n');
    writeFileSync(join(root, '.claude/rules/one.md'), '# Rule\n');
    writeFileSync(
      join(root, 'docs/doc-gardening/SEED-STALE.md'),
      '<!-- doc-freshness:rules:0 -->\n'
    );
    writeFileSync(
      join(root, 'docs/doc-freshness-registry.json'),
      JSON.stringify({
        agentsMap: { path: 'CLAUDE.md', maxLines: 120 },
        crossLinkScopes: ['CLAUDE.md'],
        computers: {
          rules: { type: 'globCount', pattern: '.claude/rules/*.md' },
        },
        freshnessMarkers: [
          {
            id: 'rules',
            files: ['docs/doc-gardening/SEED-STALE.md'],
            computer: 'rules',
            gardeningOnly: true,
          },
        ],
      })
    );
    // Only GitHub is an inert recorder. Commit and push use real Git and a local bare remote.
    writeFileSync(
      join(bin, 'gh'),
      '#!/bin/sh\ncase "$1 $2" in\n  "auth status") exit 0 ;;\n  "pr create") printf "%s\\n" "$@" > "$GARDENING_PR_ARGS"; printf "https://example.invalid/local-gardening-proof\\n" ;;\n  *) exit 1 ;;\nesac\n'
    );
    chmodSync(join(bin, 'gh'), 0o755);
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.useConfigOnly',
      GIT_CONFIG_VALUE_0: 'true',
      GARDENING_PR_ARGS: join(temporary, 'pr-args'),
    };
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: root,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git('init', '-b', 'main');
    execFileSync('git', ['init', '--bare', remote], { env, stdio: 'ignore' });
    git('remote', 'add', 'origin', remote);
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'fixture'
    );
    const beforeConfig = git('config', '--local', '--list');
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts/doc-gardening-agent.mjs')],
      { cwd: root, env, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      git('show', 'HEAD:docs/doc-gardening/SEED-STALE.md'),
      '<!-- doc-freshness:rules:1 -->'
    );
    assert.match(
      git('log', '-1', '--format=%an <%ae>'),
      /^jovie-bot\[bot\] <jovie-bot\[bot\]@users\.noreply\.github\.com>$/
    );
    const branch = git('branch', '--show-current');
    const pushed = execFileSync(
      'git',
      ['--git-dir', remote, 'rev-parse', `refs/heads/${branch}`],
      { env, encoding: 'utf8' }
    ).trim();
    assert.equal(pushed, git('rev-parse', 'HEAD'));
    const afterConfig = git('config', '--local', '--list')
      .split('\n')
      .filter(line => !line.startsWith(`branch.${branch}.`))
      .join('\n');
    assert.equal(afterConfig, beforeConfig);
    const prArgs = readFileSync(join(temporary, 'pr-args'), 'utf8');
    assert.match(prArgs, /--draft\n/);
    assert.match(prArgs, /--head\n/);
    assert.equal(git('status', '--porcelain'), '');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
