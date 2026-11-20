import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, vi } from 'vitest';
import {
  BRAND_NAME_COVERAGE_COMMAND,
  EXCEPTIONS,
  readScanFile,
  main as runBrandName,
  scanDiff,
  scanFiles,
  scanRepo,
  scanText,
} from '../../anti-slop/brand-name.mjs';
import { runMatchers } from '../../anti-slop/run.mjs';
import {
  SCRIPT_CONTRACT_VITEST_TESTS,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';
import {
  cli,
  cliRepo,
  commit,
  git,
  put,
  repo,
} from './brand-name-test-fixtures.mjs';

const kinds = (text, file = 'a.md') =>
  scanText(text, { file }).map(h => `${h.kind}:${h.text}`);
const locations = (text, file) =>
  scanText(text, { file }).map(h => `${h.line}:${h.kind}:${h.text}`);
test('only root historical files are excluded in explicit and diff CLI modes', () => {
  const root = cliRepo();
  put(root, 'CHANGELOG.md', 'Jovy historical');
  put(root, 'pnpm-lock.yaml', 'Jovy generated');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  put(root, 'docs/CHANGELOG.md', 'Welcome to Jovy');
  put(root, 'docs/pnpm-lock.yaml', 'Jovy newly authored');
  commit(root);
  const entry = 'scripts/anti-slop/brand-name.mjs';
  assert.equal(
    cli(root, entry, ['--files', 'CHANGELOG.md', 'pnpm-lock.yaml']).status,
    0
  );
  for (const args of [
    ['--files', 'docs/CHANGELOG.md', 'docs/pnpm-lock.yaml'],
    ['--diff-base', base],
  ]) {
    const result = cli(root, entry, args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /misspelling "Jovy" docs\/CHANGELOG.md:1/u);
    assert.match(result.stderr, /misspelling "Jovy" docs\/pnpm-lock.yaml:1/u);
    assert.equal(result.stderr.split('\n').filter(Boolean).length, 2);
  }
});
test('integrated CLI stops when missing-only or binary-only files are filtered', () => {
  const root = cliRepo();
  put(root, 'payload.dat', 'Jovy\0binary');
  put(root, 'image.png', 'Jovy');
  for (const files of [['missing.md'], ['payload.dat'], ['image.png']]) {
    const result = cli(root, 'scripts/anti-slop/run.mjs', [
      'check',
      '--files',
      ...files,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
test('integrated CLI still runs the frontend checker for nonempty eligible input', () => {
  const root = cliRepo();
  const file = 'apps/web/styles/brand.css';
  put(root, file, 'div { transition: all 1s; }');
  const result = cli(root, 'scripts/anti-slop/run.mjs', [
    'check',
    '--files',
    'missing.md',
    file,
  ]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /ERROR FS-004.*brand\.css:1/u);
  put(root, file, 'div { transition: opacity 1s; }');
  const clean = cli(root, 'scripts/anti-slop/run.mjs', [
    'check',
    '--files',
    file,
  ]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /\[frontend-skill\] 0 error\(s\)/u);
});
test('repo and explicit file scans share binary, deleted and deliberate fixture filtering', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovy');
  put(root, 'blob.dat', 'Jovy\0payload');
  put(root, 'image.png', 'Jovy');
  put(root, 'scripts/anti-slop/brand-name.mjs', 'Jovy');
  put(root, 'docs/design-system/anti-slop-rules.json', 'Jovy');
  put(root, 'deleted.md', 'Jovy');
  git(root, 'add', '.');
  rmSync(join(root, 'deleted.md'));
  const files = [
    'copy.md',
    'blob.dat',
    'image.png',
    'scripts/anti-slop/brand-name.mjs',
    'docs/design-system/anti-slop-rules.json',
    'deleted.md',
  ];
  assert.deepEqual(scanRepo(root), scanFiles(files, root));
  assert.deepEqual(
    scanFiles(files, root).map(h => h.file),
    ['copy.md']
  );
  assert.deepEqual(
    scanFiles([join(root, 'copy.md')], root),
    scanFiles(['copy.md'], root)
  );
  const registry = {
    rules: [
      {
        id: 'ASR-001',
        severity: 'block',
        enforcement: { matchers: [{ pattern: 'Jovy', flags: 'gu' }] },
      },
    ],
  };
  assert.deepEqual(runMatchers(registry, ['blob.dat', 'deleted.md'], root), []);
  assert.equal(runMatchers(registry, ['copy.md'], root).length, 1);
});

test('diff scans real committed files with fence state, exact exceptions and line attribution', () => {
  const root = repo();
  const file = 'a spaced "quoted" \\ file.md';
  put(root, file, 'Jovy existing\n```text\nold command\n```\nold tail\n');
  put(root, 'deleted.md', 'Jovy');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  put(
    root,
    file,
    'Jovy existing\n```text\nJovy in code\n```\nJovee added\nJovy also added\n'
  );
  put(root, 'new.md', '~~~\nJovy code\n~~~\nJovies prose\n');
  const quote = readFileSync(
    new URL('../../../canon/PRODUCT.md', import.meta.url),
    'utf8'
  ).match(
    /\*\*EVENT:\*\* Tim White, 2026-10-20: "jovie[\s\S]*?DS and IA\."/u
  )[0];
  put(root, 'canon/PRODUCT.md', quote + '\nJovy outside quote\n');
  put(root, 'data.bin', 'Jovy\0binary');
  rmSync(join(root, 'deleted.md'));
  commit(root);
  assert.deepEqual(
    scanDiff(base, root).map(({ file, line, text }) => ({ file, line, text })),
    [
      { file, line: 5, text: 'Jovee' },
      { file, line: 6, text: 'Jovy' },
      { file: 'canon/PRODUCT.md', line: 7, text: 'Jovy' },
      { file: 'new.md', line: 4, text: 'Jovies' },
    ]
  );
});

test('CI selects the guard for code and arbitrary text extensions and discovers real assertions', () => {
  const guard = selectSourceGuards('pull_request', ['README.md']).find(
    g => g.id === 'anti-slop'
  );
  assert.ok(guard.command.includes('node scripts/anti-slop/brand-name.mjs'));
  assert.ok(
    guard.command.includes(
      'node --test --test-concurrency=1 --test-isolation=none scripts/anti-slop/anti-slop.test.mjs'
    )
  );
  assert.ok(!guard.command.includes(BRAND_NAME_COVERAGE_COMMAND));

  for (const path of [
    'apps/web/a.tsx',
    'apps/desktop/a.swift',
    'packages/ui/a.ts',
    'assets/copy.custom',
    'README.md',
  ]) {
    assert.ok(
      selectSourceGuards('pull_request', [path]).some(
        g => g.id === 'anti-slop'
      ),
      path
    );
  }
  assert.ok(
    SCRIPT_CONTRACT_VITEST_TESTS.includes(
      'scripts/lib/__tests__/brand-name.test.mjs'
    )
  );
  assert.ok(
    selectScriptContracts(['scripts/anti-slop/brand-name.mjs']).vitest.includes(
      'scripts/lib/__tests__/brand-name.test.mjs'
    )
  );
});

test('file CLI and integrated check safely ignore deliberate registry text and deleted files', () => {
  const script = resolve('scripts/anti-slop/brand-name.mjs');
  const files = [
    'docs/design-system/anti-slop-rules.json',
    'scripts/anti-slop/missing.md',
  ];
  /** @type {Array<[string, string[]]>} */
  const entries = [
    [script, ['--files', ...files]],
    [resolve('scripts/anti-slop/run.mjs'), ['check', '--files', ...files]],
  ];
  for (const [entry, args] of entries) {
    const result = spawnSync(process.execPath, [entry, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('CLI modes return failures with exact locations and clean scans return success', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    assert.equal(runBrandName([], root), 0);
    assert.match(out.mock.calls.flat().join(''), /0 hits; no baseline/u);
    put(root, 'copy.md', 'Jovy');
    commit(root);
    assert.equal(runBrandName(['--list'], root), 1);
    assert.equal(runBrandName(['--files', 'copy.md'], root), 1);
    assert.equal(runBrandName(['--diff-base', base], root), 1);
    assert.equal(runBrandName(['--text-file', join(root, 'copy.md')], root), 1);
    assert.match(err.mock.calls.flat().join(''), /copy.md:1/u);
    put(root, 'copy.md', 'Jovie');
    commit(root);
    assert.equal(runBrandName(['--files', 'copy.md'], root), 0);
    assert.equal(runBrandName(['--diff-base', base], root), 0);
    assert.equal(runBrandName(['--text-file', join(root, 'copy.md')], root), 0);
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
});

test('only skill frontmatter slugs are identifiers; names in other contexts remain checked', () => {
  assert.deepEqual(
    kinds(
      '---\nname: jovie\ndescription: Jovy title\n---\nname: jovie',
      'skills/example/SKILL.md'
    ),
    ['misspelling:Jovy', 'casing:jovie']
  );
  assert.deepEqual(kinds('---\nname: Jovies\n---', 'skills/example/SKILL.md'), [
    'misspelling:Jovies',
  ]);
  assert.deepEqual(kinds('name: jovie', 'other.md'), ['casing:jovie']);
  assert.deepEqual(kinds('---\nname: jovie', 'skills/example/SKILL.md'), [
    'casing:jovie',
  ]);
});

test('fences respect delimiter type and length, including embedded shorter fences', () => {
  assert.deepEqual(kinds('````text\n```\nJovy\n~~~\n````\nJovee'), [
    'misspelling:Jovee',
  ]);
  assert.deepEqual(
    kinds('~~~text\nJovy\n~~~ trailing text\nJovy\n~~~\nJovee'),
    ['misspelling:Jovee']
  );
});

test('the committed quote and intentional negative assertion do not exempt neighboring typos', () => {
  for (const file of [
    'canon/PRODUCT.md',
    'apps/web/tests/unit/marketing/header-brand-config.test.ts',
  ]) {
    const e = EXCEPTIONS.find(e => e.file === file);
    assert.ok(e.reason.trim());
    assert.deepEqual(
      scanText(e.match + ' Jovy', { file }).map(h => h.text),
      ['Jovy']
    );
    assert.ok(
      scanText(e.match.replace(/jovie|Jovies/u, 'Jovee'), { file }).some(
        h => h.text === 'Jovee'
      )
    );
  }
});

test('safe file reading ignores directories and surfaces unexpected IO errors', () => {
  const root = repo();
  assert.equal(readScanFile('.', root), null);
  assert.throws(() => readScanFile('x\0bad', root), /null bytes/u);
});

test('guard source exclusions apply only to exact owned paths and leave other matchers intact', () => {
  const root = repo();
  put(root, 'content/brand-name.mjs', 'Jovy');
  put(root, 'content/brand-name-copy.test.mjs', 'Jovy');
  put(root, 'scripts/lib/__tests__/brand-name-copy.test.mjs', 'Jovy');
  assert.deepEqual(
    scanFiles(['scripts/lib/__tests__/brand-name-copy.test.mjs'], root),
    []
  );
  assert.equal(
    scanFiles(['content/brand-name-copy.test.mjs'], root)[0].text,
    'Jovy'
  );
  put(root, 'content/anti-slop-rules.json', 'Jovee');
  put(root, 'docs/CHANGELOG.md-preview.ts', 'Jovy');
  put(root, 'pnpm-lock.yaml-note.md', 'Jovee');
  put(root, 'scripts/anti-slop/brand-name.mjs', 'Jovy\nJovy');
  assert.deepEqual(
    scanFiles(
      [
        'content/brand-name.mjs',
        'content/anti-slop-rules.json',
        'docs/CHANGELOG.md-preview.ts',
        'pnpm-lock.yaml-note.md',
      ],
      root
    ).map(h => h.text),
    ['Jovy', 'Jovee', 'Jovy', 'Jovee']
  );
  const reg = {
    rules: [
      {
        id: 'ASR-001',
        severity: 'block',
        enforcement: { matchers: [{ pattern: 'Jovy', flags: 'gu' }] },
      },
    ],
  };
  assert.deepEqual(
    runMatchers(reg, ['scripts/anti-slop/brand-name.mjs'], root).map(
      h => h.line
    ),
    [1, 2]
  );
});

test('all prose capitalization variants are checked while the canonical spelling passes', () => {
  for (let bits = 0; bits < 32; bits += 1) {
    const variant = [...'jovie']
      .map((c, i) => (bits & (1 << i) ? c.toUpperCase() : c))
      .join('');
    assert.deepEqual(
      kinds(`Welcome to ${variant}.`),
      variant === 'Jovie' ? [] : [`casing:${variant}`]
    );
  }
});

test('bare public subdomains are checked while emails, fixture domains and URLs remain identifiers', () => {
  assert.deepEqual(kinds('Visit www.jovie.com and www.jovie.io'), [
    'domain:jovie.com',
    'domain:jovie.io',
  ]);
  assert.deepEqual(
    kinds(
      'ci@www.jovie.com app.jovie.com test.jovie.com https://www.jovie.com/a'
    ),
    []
  );
});

test('existing CLI source stays literal and adjacent named copy is still checked', () => {
  const source = readFileSync(resolve('packages/jovie-cli/src/cli.ts'), 'utf8');
  assert.ok(source.includes('Usage: jovie <command> [options]'));
  assert.deepEqual(scanText(source, { file: 'renamed-source.ts' }), []);
  const line = source.split('\n').length + 1;
  assert.deepEqual(
    locations(
      source + '\nexport const headline = "Welcome to jovie";',
      'renamed-source.ts'
    ),
    [`${line}:casing:jovie`]
  );
});

test('internal diagnostics and protocol strings do not become copy from whitespace', () => {
  assert.deepEqual(kinds('const internal = "Jovy at jovie.io";', 'a.ts'), [
    'misspelling:Jovy',
    'domain:jovie.io',
  ]);
  const source = [
    'test("jovie auth protocol", () => {});',
    'throw new Error("Invalid jovie work feed request");',
    'const protocol = { command: "jovie mesh send", product: "jovie" };',
    'const query = "loading jovie profile";',
    '<h1>Welcome to JOVIE</h1>;',
    'export const headline = "Welcome to jovie";',
  ].join('\n');
  assert.deepEqual(locations(source, 'arbitrary.tsx'), [
    '5:casing:JOVIE',
    '6:casing:jovie',
  ]);
});
