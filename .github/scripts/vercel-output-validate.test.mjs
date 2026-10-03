import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compileIgnore,
  formatViolations,
  main,
  validateVercelOutput,
} from './vercel-output-validate.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const script = resolve(repo, '.github/scripts/vercel-output-validate.mjs');

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-validate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes = 'asset bytes') => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  const link = (name, target) => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);
    return path;
  };
  const fn = (name, filePathMap) => {
    put(
      `.vercel/output/functions/${name}.func/.vc-config.json`,
      JSON.stringify({ runtime: 'nodejs22.x', filePathMap })
    );
  };
  put('.vercel/output/config.json', '{"version":3}');
  mkdirSync(resolve(root, '.vercel/output/static'));
  return { root, put, link, fn };
}

const invariantsOf = result => result.violations.map(v => v.invariant);

test('clean output with a healthy pnpm directory link reports zero violations', t => {
  const f = fixture(t);
  const store = 'node_modules/.pnpm/debug@4/node_modules/debug';
  f.put(`${store}/index.js`, 'x');
  const link = 'node_modules/.pnpm/node_modules/debug';
  f.link(link, '../debug@4/node_modules/debug');
  f.put('CHANGELOG.md', '# log');
  f.put(`${link}/marker`, 'unused'); // marker file under the link path itself
  f.fn('api', {
    [link]: link,
    [`${store}/index.js`]: `${store}/index.js`,
    'CHANGELOG.md': 'CHANGELOG.md',
  });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(result.violations, []);
  assert.equal(result.configs, 1);
  assert.equal(result.references, 3);
});

test('flags filePathMap keys and values that resolve outside the archive root', t => {
  const f = fixture(t);
  f.put('real.txt', 'x');
  f.fn('edge', {
    '../../outside.txt': '../../outside.txt',
    '../key-escape.txt': 'real.txt',
    'absolute.txt': resolve(tmpdir(), 'jovie-validate-absent-target'),
  });
  const result = validateVercelOutput({ root: f.root });
  const invariantSet = new Set(invariantsOf(result));
  assert.ok(invariantSet.has('path-escape'));
  // ../../outside.txt escapes in key AND value; ../key-escape.txt escapes as
  // a key; the absolute value escapes = 4 reports.
  assert.equal(
    result.violations.filter(v => v.invariant === 'path-escape').length,
    4
  );
});

test('flags file-symlink trace targets (the #18543 extraction failure)', t => {
  const f = fixture(t);
  f.put('apps/web/screenshot-catalog/current/profile-desktop.png', 'png');
  const exportLink = 'apps/web/public/product-screenshots/profile-desktop.png';
  f.link(exportLink, '../../screenshot-catalog/current/profile-desktop.png');
  f.fn('admin/screenshots', { [exportLink]: exportLink });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['file-symlink']);
});

test('flags dangling file symlinks in traces', t => {
  const f = fixture(t);
  f.link('dead-link.txt', 'absent.txt');
  f.fn('api', { 'dead-link.txt': 'dead-link.txt' });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['file-symlink']);
});

test('flags files traced through a pnpm directory symlink (#18740)', t => {
  const f = fixture(t);
  const store =
    'node_modules/.pnpm/import-in-the-middle@3.5.1/node_modules/import-in-the-middle';
  f.put(`${store}/index.js`, 'hook');
  const hoisted = 'node_modules/.pnpm/node_modules/import-in-the-middle';
  f.link(
    hoisted,
    '../import-in-the-middle@3.5.1/node_modules/import-in-the-middle'
  );
  f.fn('api', {
    [hoisted]: hoisted,
    [`${hoisted}/index.js`]: `${hoisted}/index.js`,
  });
  const result = validateVercelOutput({ root: f.root });
  const invariants = invariantsOf(result);
  assert.ok(invariants.includes('through-directory-link'));
});

test('flags directory links whose target uploads nothing (#18749)', t => {
  const f = fixture(t);
  f.put(
    'node_modules/.pnpm/supports-color@5.5.0/node_modules/supports-color/index.js',
    'x'
  );
  const colorLink = 'node_modules/.pnpm/node_modules/supports-color';
  f.link(colorLink, '../supports-color@5.5.0/node_modules/supports-color');
  const debugStore = 'node_modules/.pnpm/debug@4/node_modules/debug';
  f.put(`${debugStore}/index.js`, 'x');
  const debugLink = 'node_modules/.pnpm/node_modules/debug';
  f.link(debugLink, '../debug@4/node_modules/debug');
  f.fn('a', { [colorLink]: colorLink, [debugLink]: debugLink });
  f.fn('b', { [`${debugStore}/index.js`]: `${debugStore}/index.js` });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['dangling-directory-link']);
  assert.match(result.violations[0].detail, /supports-color/);
});

test('flags file keys beneath a linked directory key (#18755)', t => {
  const f = fixture(t);
  const store =
    'node_modules/.pnpm/import-in-the-middle@3.5.1/node_modules/import-in-the-middle';
  f.put(`${store}/CHANGELOG.md`, 'log');
  const hoisted = 'node_modules/.pnpm/node_modules/import-in-the-middle';
  f.link(
    hoisted,
    '../import-in-the-middle@3.5.1/node_modules/import-in-the-middle'
  );
  f.fn('flow', {
    [hoisted]: hoisted,
    [`${hoisted}/CHANGELOG.md`]: `${store}/CHANGELOG.md`,
  });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['key-under-linked-key']);
});

test('flags traced paths that do not exist', t => {
  const f = fixture(t);
  f.fn('api', { 'ghost.txt': 'missing/real-file.txt' });
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['traced-path-missing']);
});

test('flags traced repository files dropped by .vercelignore (#18384)', t => {
  const f = fixture(t);
  f.put('.vercelignore', '*.md\n**/tests/\n!CHANGELOG.md\n');
  f.put('docs/FEATURE_REGISTRY.md', 'x');
  f.put('CHANGELOG.md', 'x'); // re-included: not a violation
  f.put('apps/web/tests/quarantine.json', '{}');
  f.put('node_modules/.pnpm/dep@1/node_modules/dep/index.js', 'x');
  f.fn('api', {
    'docs/FEATURE_REGISTRY.md': 'docs/FEATURE_REGISTRY.md',
    'CHANGELOG.md': 'CHANGELOG.md',
    'apps/web/tests/quarantine.json': 'apps/web/tests/quarantine.json',
    'node_modules/.pnpm/dep@1/node_modules/dep/index.js':
      'node_modules/.pnpm/dep@1/node_modules/dep/index.js',
  });
  const result = validateVercelOutput({ root: f.root });
  const dropped = result.violations
    .filter(v => v.invariant === 'vercelignore-dropped')
    .map(v => v.detail);
  // *.md matches FEATURE_REGISTRY.md; **/tests/ matches quarantine.json;
  // CHANGELOG.md is re-included; node_modules payloads are exempt.
  assert.equal(dropped.length, 2);
  assert.ok(dropped.some(line => line.includes('FEATURE_REGISTRY.md')));
  assert.ok(dropped.some(line => line.includes('quarantine.json')));
});

test('reports every violation in one pass, not just the first', t => {
  const f = fixture(t);
  f.put('real.txt', 'x');
  f.link('bad-file-link.txt', 'real.txt');
  f.fn('multi', {
    'escape.txt': '../escape.txt',
    'bad-file-link.txt': 'bad-file-link.txt',
    'gone.txt': 'gone.txt',
  });
  const result = validateVercelOutput({ root: f.root });
  const invariants = new Set(invariantsOf(result));
  assert.ok(invariants.has('path-escape'));
  assert.ok(invariants.has('file-symlink'));
  assert.ok(invariants.has('traced-path-missing'));
  assert.equal(result.violations.length, 3);
});

test('missing .vercel/output is itself a violation', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-validate-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = validateVercelOutput({ root });
  assert.deepEqual(invariantsOf(result), ['output-shape']);
});

test('unparseable .vc-config.json is a violation, not a crash', t => {
  const f = fixture(t);
  f.put('.vercel/output/functions/bad.func/.vc-config.json', '{nope');
  const result = validateVercelOutput({ root: f.root });
  assert.deepEqual(invariantsOf(result), ['vc-config-parse']);
});

test('gitignore matcher honors anchoring, dir-only, globstars, negation', () => {
  const ignore = compileIgnore(
    [
      '*.log',
      '/docs/',
      'docs/*',
      '!/docs/keep.md',
      '**/tests/',
      '!apps/web/tests/',
      'apps/web/tests/*',
      '!apps/web/tests/quarantine.json',
      'build/**',
    ].join('\n')
  );
  assert.equal(ignore.ignores('error.log'), true);
  assert.equal(ignore.ignores('docs/guide.md'), true);
  assert.equal(ignore.ignores('docs/keep.md'), false);
  assert.equal(ignore.ignores('apps/web/tests/helper.ts'), true);
  assert.equal(ignore.ignores('apps/web/tests/quarantine.json'), false);
  assert.equal(ignore.ignores('build/output.js'), true);
  assert.equal(ignore.ignores('src/app.ts'), false);
});

test('CLI exits 1 and lists all violations on a bad output', t => {
  const f = fixture(t);
  f.put('real.txt', 'x');
  f.link('bad-file-link.txt', 'real.txt');
  f.fn('multi', {
    'escape.txt': '../escape.txt',
    'bad-file-link.txt': 'bad-file-link.txt',
    'gone.txt': 'gone.txt',
  });
  let stdout = '';
  let stderr = '';
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [script, '--root', f.root], {
      encoding: 'utf8',
    });
  } catch (error) {
    status = error.status;
    stdout = error.stdout;
    stderr = error.stderr;
  }
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /path-escape/);
  assert.match(stderr, /file-symlink/);
  assert.match(stderr, /traced-path-missing/);
  assert.match(stderr, /3 violation\(s\)/);
});

test('CLI exits 0 on a clean output', t => {
  const f = fixture(t);
  f.put('CHANGELOG.md', 'x');
  f.fn('api', { 'CHANGELOG.md': 'CHANGELOG.md' });
  const stdout = execFileSync(process.execPath, [script, '--root', f.root], {
    encoding: 'utf8',
  });
  assert.match(stdout, /clean: configs=1 references=1/);
});

test('main reports violations to stderr and rejects unknown arguments', t => {
  const f = fixture(t);
  f.fn('api', { 'gone.txt': 'gone.txt' });
  const errLines = [];
  const outLines = [];
  assert.equal(
    main([], {
      cwd: f.root,
      log: line => outLines.push(line),
      err: line => errLines.push(line),
    }),
    1
  );
  assert.equal(outLines.length, 0);
  assert.match(errLines.join('\n'), /traced-path-missing/);
  assert.equal(
    main(['--root', f.root], {
      cwd: f.root,
      log: line => outLines.push(line),
      err: line => errLines.push(line),
    }),
    1
  );
  f.put('gone.txt', 'now exists');
  assert.equal(
    main(['--root', f.root], {
      log: line => outLines.push(line),
      err: line => errLines.push(line),
    }),
    0
  );
  assert.ok(outLines.at(-1).includes('clean: configs=1'));
  assert.throws(() => main(['--root']), /--root requires a value/);
  assert.throws(() => main(['--bogus']), /Unknown arguments/);
});

test('formatViolations summarizes clean and dirty results', () => {
  assert.match(
    formatViolations({ violations: [], configs: 2, references: 9 }),
    /clean: configs=2 references=9/
  );
  assert.match(
    formatViolations({
      violations: [
        { invariant: 'x', config: 'c', detail: 'd' },
        { invariant: 'y', config: null, detail: 'e' },
      ],
      configs: 2,
      references: 9,
    }),
    /2 violation\(s\)/
  );
});

test('real repository .vercelignore parses and re-includes runtime files', () => {
  const ignore = compileIgnore(
    readFileSync(resolve(repo, '.vercelignore'), 'utf8')
  );
  assert.equal(ignore.ignores('CHANGELOG.md'), false);
  assert.equal(ignore.ignores('docs/FEATURE_REGISTRY.md'), false);
  assert.equal(ignore.ignores('docs/OTHER.md'), true);
  assert.equal(
    ignore.ignores('apps/docs/scripts/validate-articles.mjs'),
    false
  );
  assert.equal(ignore.ignores('apps/docs/lib/article-registry.mjs'), false);
  assert.equal(ignore.ignores('apps/docs/lib/help-center-seo.mjs'), false);
  assert.equal(ignore.ignores('apps/docs/lib/visual-proof-assets.mjs'), true);
  assert.equal(ignore.ignores('apps/docs/lib/article-registry.test.mjs'), true);
  assert.equal(ignore.ignores('apps/docs/scripts/build-pagefind.mjs'), false);
  assert.equal(
    ignore.ignores('apps/docs/scripts/materialize-proof.mjs'),
    false
  );
  assert.equal(
    ignore.ignores('apps/docs/public/proof/connect-music-accounts.png'),
    false
  );
  assert.equal(
    ignore.ignores('docs/screenshots/help-center/connect-music-accounts.png'),
    true
  );
  assert.equal(ignore.ignores('docs/screenshots/pitch-v1/deck.png'), true);
  assert.equal(ignore.ignores('apps/web/tests/quarantine.json'), false);
  assert.equal(ignore.ignores('apps/web/tests/e2e/foo.spec.ts'), true);
});
