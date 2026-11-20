import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  findDesignAuthorityViolations,
  hasExactSerifException,
  interactiveRatchetViolations,
  isSerifDeclaration,
  rawInteractiveCounts,
  validateSerifException,
} from './design-authority-guard.mjs';

test('active design authorities and product source have no contradictions', () => {
  assert.deepEqual(findDesignAuthorityViolations(), []);
});

test('serif detector targets declarations, not prose or sans-serif', () => {
  assert.equal(isSerifDeclaration('A user wrote the word serif.'), false);
  assert.equal(isSerifDeclaration('font-family: Inter, sans-serif;'), false);
  assert.equal(isSerifDeclaration('font: 500 1rem/1.4 sans-serif;'), false);
  assert.equal(isSerifDeclaration('font: 500 1rem/1.4 serif;'), true);
  assert.equal(isSerifDeclaration('font-family: Georgia, serif;'), true);
  assert.equal(isSerifDeclaration("fontFamily: 'Source Serif 4'"), true);
});

test('serif exceptions require an exact path and match', () => {
  const exceptions = [
    { path: 'apps/web/media.tsx', match: 'Source Serif 4', used: false },
  ];
  assert.ok(
    hasExactSerifException(
      exceptions,
      'apps/web/media.tsx',
      "fontFamily: 'Source Serif 4'"
    )
  );
  assert.equal(
    hasExactSerifException(exceptions, 'apps/web/other.tsx', 'Source Serif 4'),
    undefined
  );
});

test('serif exceptions reject broad or wildcard exemptions', () => {
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/*.tsx',
        match: 'Source Serif 4',
        kind: 'media',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /paths must be exact/
  );
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/media.tsx',
        match: 'serif',
        kind: 'media',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /concrete declaration/
  );
  assert.deepEqual(
    validateSerifException({
      path: 'apps/web/media.tsx',
      match: 'font-serif',
      kind: 'media',
      owner: 'Design',
      reason: 'A media asset needs its original typeface.',
    }),
    {
      path: 'apps/web/media.tsx',
      match: 'font-serif',
      kind: 'media',
      owner: 'Design',
      reason: 'A media asset needs its original typeface.',
      used: false,
    }
  );
  assert.throws(
    () =>
      validateSerifException({
        path: 'apps/web/media.tsx',
        match: 'Source Serif 4',
        kind: 'product',
        owner: 'Design',
        reason: 'A media asset needs its original typeface.',
      }),
    /kind must be ugc or media/
  );
});

const settingsFile = 'apps/web/app/app/(shell)/settings/example.tsx';
test('raw control detector parses JSX, ignoring comments, strings and test files', () => {
  const source = `// <button> in a comment
    const text = '<input />';
    const view = <><button
      type="button">Save</button><input /><select /><Button /><Input /></>;`;
  const counts = rawInteractiveCounts(settingsFile, source);
  assert.deepEqual(counts, { button: 1, input: 1, select: 1 });
  assert.deepEqual(
    rawInteractiveCounts(settingsFile.replace('.tsx', '.test.tsx'), source),
    {}
  );
});

test('raw control ratchet blocks new files, new tags and growth; requires debt shrinkage', () => {
  const sources = { [settingsFile]: '<button />' };
  const baseline = { [`${settingsFile}:<button>`]: 1 };
  assert.deepEqual(interactiveRatchetViolations(sources, baseline), []);
  assert.equal(interactiveRatchetViolations(sources, {}).length, 1);
  for (const source of ['<button /><input />', '<button /><button />']) {
    const findings = interactiveRatchetViolations(
      { [settingsFile]: source },
      baseline
    );
    assert.equal(findings.length, 1);
  }
  assert.match(interactiveRatchetViolations({}, baseline)[0], /shrink/);
});

test('large tracked trees still scan product files beyond the default git buffer', t => {
  const root = mkdtempSync(join(tmpdir(), 'design-authority-large-tree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  for (const file of [
    'canon/invariants.jsonl',
    'docs/llms-design-manifest.txt',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
  }
  for (const file of [
    'DESIGN.md',
    '.claude/rules/ui.md',
    'docs/marketing/AGENT_GUIDE.md',
    '.agents/skills/gstack/design-canonical/SKILL.md.tmpl',
    '.agents/skills/gstack/design-consultation/SKILL.md.tmpl',
    '.agents/skills/gstack/design-html/SKILL.md.tmpl',
  ])
    write(file, '');
  write('scripts/design-authority-exceptions.json', '{"serif":[]}');
  write('scripts/design-authority-interactive-baseline.json', '{}');
  const git = (args, options = {}) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      ...options,
    });
  git(['init', '-q', '-b', 'main']);
  const blob = git(['hash-object', '-w', '--stdin'], {
    input: 'fixture\n',
  }).trim();
  const prefix = 'neutral/'.padEnd(240, 'x');
  const entries = Array.from(
    { length: 5000 },
    (_, index) => `100644 ${blob}\t${prefix}/file-${index}.txt`
  );
  const product = 'packages/zz-large-tree/source.css';
  write(product, 'a { color: inherit; }\n');
  entries.push(`100644 ${blob}\t${product}`);
  git(['update-index', '--index-info'], { input: entries.join('\n') + '\n' });
  // Prove this fixture exceeds Node's actual default, without truncating the scan.
  const unbounded = spawnSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.ok(unbounded.error && 'code' in unbounded.error);
  assert.equal(unbounded.error.code, 'ENOBUFS');
  assert.deepEqual(findDesignAuthorityViolations(root), []);
  write(product, 'a { font-family: Georgia, serif; }\n');
  assert.deepEqual(findDesignAuthorityViolations(root), [
    `${product}:1: serif declaration`,
  ]);
});
