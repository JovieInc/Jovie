import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { main, planSourceDocs } from '../../source-docs-check.mjs';
import {
  assertInertSourceProse,
  MAX_PROSE_FILE_BYTES,
  readSourceProseEntries,
} from '../source-prose.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const classify = paths => ({
  eligible: paths.length > 0,
  paths: [...paths].sort(),
  reasons: [],
});
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'source-docs-range-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
      ),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Source fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(root, 'docs/research'), { recursive: true });
  writeFileSync(join(root, 'policy.md'), 'policy input\n');
  git('add', '.');
  git('commit', '-qm', 'base fixture');
  const baseSha = git('rev-parse', 'HEAD');
  return {
    root,
    git,
    baseSha,
    plan: headSha => planSourceDocs({ root, baseSha, headSha, classify }),
  };
}
test('exact range retains rename originals and deleted inputs', t => {
  const f = fixture(t);
  f.git('mv', 'policy.md', 'docs/research/notes.md');
  f.git('commit', '-qm', 'rename fixture');
  assert.deepEqual(f.plan(f.git('rev-parse', 'HEAD')).paths, [
    'docs/research/notes.md',
    'policy.md',
  ]);
  assert.equal(f.plan(f.git('rev-parse', 'HEAD')).eligible, false);
});
test('missing, empty, mismatched, stale and dirty generations cannot qualify', t => {
  const f = fixture(t);
  assert.equal(f.plan(f.baseSha).eligible, false);
  assert.equal(
    planSourceDocs({ root: f.root, baseSha: '', headSha: f.baseSha, classify })
      .eligible,
    false
  );
  assert.equal(
    planSourceDocs({
      root: f.root,
      baseSha: f.baseSha,
      headSha: f.baseSha,
      currentBaseSha: 'f'.repeat(40),
      classify,
    }).eligible,
    false
  );
  writeFileSync(join(f.root, 'docs/research/notes.md'), 'research\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'research fixture');
  const headSha = f.git('rev-parse', 'HEAD');
  assert.equal(f.plan(headSha).eligible, true);
  assert.throws(() => f.plan(f.baseSha), /head mismatch/);
  writeFileSync(join(f.root, 'docs/research/notes.md'), 'uncommitted\n');
  assert.throws(() => f.plan(headSha), /checkout is modified/);
});
test('a diverged exact base retains full validation', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'docs/research/notes.md'), 'research\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'research fixture');
  const headSha = f.git('rev-parse', 'HEAD');
  f.git('checkout', '--detach', f.baseSha);
  writeFileSync(
    join(f.root, 'new-consumer.mjs'),
    "import fs from 'node:fs';\n"
  );
  f.git('add', '.');
  f.git('commit', '-qm', 'new consumer fixture');
  const baseSha = f.git('rev-parse', 'HEAD');
  f.git('checkout', '--detach', headSha);
  assert.equal(
    planSourceDocs({ root: f.root, baseSha, headSha, classify }).reasons[0],
    'base-not-ancestor'
  );
});
for (const [name, bytes, executable] of [
  ['executable mode', Buffer.from('# Research notes\n'), true],
  ['shell shebang', Buffer.from('#!/bin/sh\nprintf unsafe\n')],
  [
    'multiple-BOM shebang',
    Buffer.from('\ufeff\ufeff#!/bin/sh\nprintf unsafe\n'),
  ],
  ['NUL', Buffer.from('Research\0notes\n')],
  ['invalid UTF-8', Buffer.from([0x23, 0x20, 0xff, 0x0a])],
  ['active HTML', Buffer.from('<script>alert(1)</script>\n')],
  ['executable fence', Buffer.from('```sh\npnpm -w deploy\n```\n')],
  ['nested indented instruction', Buffer.from('>     pnpm deploy\n')],
  ['active URI', Buffer.from('[Open](javascript:alert(1))\n')],
]) {
  test(`non-inert Markdown retains full validation: ${name}`, t => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'docs/research/notes.md'), bytes);
    if (executable) chmodSync(join(f.root, 'docs/research/notes.md'), 0o755);
    f.git('add', '.');
    f.git('commit', '-qm', 'exact boundary fixture');
    assert.equal(f.plan(f.git('rev-parse', 'HEAD')).eligible, false, name);
  });
}
test('exact Git mode wins over a benign checkout and an unchanged blob OID', t => {
  const f = fixture(t);
  const path = 'docs/research/notes.md';
  writeFileSync(join(f.root, path), 'Measured research.\n');
  f.git('add', path);
  f.git('commit', '-qm', 'regular prose');
  const baseSha = f.git('rev-parse', 'HEAD');
  const blob = f.git('rev-parse', `HEAD:${path}`);
  f.git('config', 'core.filemode', 'false');
  f.git('update-index', '--chmod=+x', path);
  f.git('commit', '-qm', 'mode only');
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', `HEAD:${path}`), blob);
  assert.equal(
    planSourceDocs({
      root: f.root,
      baseSha,
      headSha: f.git('rev-parse', 'HEAD'),
      classify,
    }).eligible,
    false
  );
});
test('oversized and unavailable exact blobs cannot qualify', t => {
  const f = fixture(t);
  const path = 'docs/research/notes.md';
  writeFileSync(join(f.root, path), Buffer.alloc(MAX_PROSE_FILE_BYTES + 1, 32));
  f.git('add', path);
  f.git('commit', '-qm', 'oversized prose');
  const headSha = f.git('rev-parse', 'HEAD');
  const blob = f.git('rev-parse', `HEAD:${path}`);
  assert.throws(
    () => readSourceProseEntries({ root: f.root, headSha, paths: [path] }),
    /bound/
  );
  rmSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  assert.throws(() =>
    readSourceProseEntries({ root: f.root, headSha, paths: [path] })
  );
});
test('the bounded prose pilot retains full validation for thirteen files', t => {
  const f = fixture(t);
  for (let i = 0; i < 13; i++)
    writeFileSync(join(f.root, `docs/research/note-${i}.md`), 'Research.\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'bounded prose');
  assert.equal(f.plan(f.git('rev-parse', 'HEAD')).eligible, false);
});
test('native object reader preserves valid Unicode prose and rejects forged bytes', t => {
  const f = fixture(t);
  const path = 'docs/research/notes.md';
  writeFileSync(
    join(f.root, path),
    '# Findings\n\nListeners prefer Sigur Rós. [Details](https://example.invalid/report).\n'
  );
  f.git('add', path);
  f.git('commit', '-qm', 'inert prose');
  const entries = readSourceProseEntries({
    root: f.root,
    headSha: f.git('rev-parse', 'HEAD'),
    paths: [path],
  });
  assert.doesNotThrow(() => assertInertSourceProse([path], entries));
  assert.throws(() =>
    assertInertSourceProse(
      [path],
      [{ ...entries[0], bytes: Buffer.from('Different bytes') }]
    )
  );
});
test('oversized native diffs retain full validation before classification', t => {
  const f = fixture(t);
  for (let i = 0; i < 300; i++)
    writeFileSync(join(f.root, `docs/research/note-${i}.md`), 'research\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'bounded fixture');
  assert.equal(
    f.plan(f.git('rev-parse', 'HEAD')).reasons[0],
    'source-range-exceeds-receipt-bound'
  );
});
test('fork and non-main event identities keep the existing full path', t => {
  const f = fixture(t);
  for (const [fork, ref] of [
    [true, 'main'],
    [false, 'integration'],
  ]) {
    const eventPath = join(f.root, `event-${fork}.json`);
    const planPath = join(f.root, `plan-${fork}.json`);
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          head: { sha: f.baseSha, repo: { full_name: 'JovieInc/Jovie', fork } },
          base: { sha: f.baseSha, ref, repo: { full_name: 'JovieInc/Jovie' } },
        },
      })
    );
    const plan = main(['plan'], {
      SOURCE_DOCS_PLAN: planPath,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      EXPECTED_BASE: f.baseSha,
      EXPECTED_HEAD: f.baseSha,
    });
    assert.equal(plan.eligible, false);
    assert.deepEqual(plan.reasons, ['unsupported-source-event']);
  }
});
test('workflow bootstraps exact-base policy before setup and preserves parallel full fallback', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const workflow = load(
    readFileSync(join(root, '.github/workflows/source-validation.yml'), 'utf8')
  );
  const steps = workflow.jobs.deterministic.steps;
  const plan = steps.findIndex(step => step.id === 'source_docs');
  const setup = steps.findIndex(
    step => step.uses === './.github/actions/setup-node-pnpm'
  );
  assert.ok(plan < setup);
  assert.match(steps[plan].run, /git archive "\$EXPECTED_BASE"/);
  assert.match(steps[setup].if, /docs_only != 'true'/);
  assert.equal(workflow.jobs.unit.needs, undefined);
  for (const job of ['deterministic', 'unit']) {
    const contract = workflow.jobs[job].steps.find(step =>
      /^(Run deterministic source contract|Validate disk-read source contracts from trusted base)$/.test(
        step.name
      )
    );
    assert.match(contract.if, /docs_only != 'true'/);
  }
  for (const name of [
    'Measure actual installed source dependency graph',
    'Preserve exact source dependency evidence',
  ]) {
    assert.match(
      steps.find(step => step.name === name).if,
      /docs_only != 'true'/
    );
  }
  assert.match(
    steps.find(step => step.name === 'Preserve exact source docs applicability')
      .with.name,
    /^source-docs-scope-/
  );
  assert.deepEqual(workflow.jobs.ready.needs, [
    'deterministic',
    'security',
    'migration',
    'coverage',
    'unit',
    'a11y',
  ]);
  assert.equal(
    workflow.jobs.security.steps.find(
      step => step.name === 'Scan the exact source diff'
    ).if,
    "steps.reuse.outputs.reuse != 'true'"
  );
});
