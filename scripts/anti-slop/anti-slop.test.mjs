import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  checkDrift,
  checkTitleCaseHeadings,
  LEGACY_PATH,
  loadRegistry,
  REGISTRY_PATH,
  TITLE_CASE_HEADING,
  validateRegistry,
} from './lib.mjs';
import { runMatchers, runValidate } from './run.mjs';

const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const base = () => ({
  schema: 'jovie.anti-slop-rules/v1',
  statusValues: ['enforced', 'shadow', 'in-review', 'planned'],
  kindValues: ['static', 'vision', 'human', 'static+vision', 'human+vision'],
  scopeValues: ['marketing', 'app'],
  mirrors: [],
  judges: [],
  rules: [
    {
      id: 'ASR-001',
      title: 'Example rule',
      statement: 'Example statement text.',
      rationale: 'Because of reasons.',
      source: { by: 'Tim White', date: '2026-10-26', ref: 'test' },
      scope: ['app'],
      severity: 'block',
      enforcement: {
        kind: 'static',
        status: 'enforced',
        check: 'x',
        evidence: ['check.mjs'],
        wiredIn: [{ file: 'lanes.mjs', token: "id: 'x'" }],
      },
    },
  ],
});
const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'anti-slop-'));
  put(root, 'check.mjs', '//');
  put(root, 'lanes.mjs', "id: 'x'");
  put(root, LEGACY_PATH, JSON.stringify({ files: [] }));
  return root;
};

test('the real registry validates and has no unregistered prose copies', () => {
  const { errors } = runValidate();
  assert.deepEqual(errors, []);
});

test('every rule carries a dated source', () => {
  for (const rule of loadRegistry().rules)
    assert.match(rule.source.date, /^\d{4}-\d{2}-\d{2}$/u);
});

test('deliberate red: an enforced rule whose check is not wired fails', () => {
  const root = repo();
  put(root, 'lanes.mjs', 'nothing here');
  const { errors } = validateRegistry(base(), root);
  assert.ok(errors.some(e => e.includes('not wired')));
});

test('deliberate red: missing evidence, duplicate id and bad scope fail', () => {
  const root = repo();
  const reg = base();
  reg.rules.push({
    ...reg.rules[0],
    scope: ['nope'],
    enforcement: { ...reg.rules[0].enforcement, evidence: ['gone.mjs'] },
  });
  const { errors } = validateRegistry(reg, root);
  assert.ok(errors.some(e => e.includes('duplicate id')));
  assert.ok(errors.some(e => e.includes('evidence missing')));
  assert.ok(errors.some(e => e.includes('scope')));
});

test('deliberate red: a new prose copy of the anti-slop list fails; citing an id passes', () => {
  const root = repo();
  put(
    root,
    '.claude/skills/x/SKILL.md',
    'Reject decorative blobs and icon-in-circle grids.'
  );
  assert.ok(
    checkDrift(base(), root).errors.some(e => e.includes('new prose copy'))
  );
  put(
    root,
    '.claude/skills/x/SKILL.md',
    'Reject decorative blobs. See ASR-001.'
  );
  assert.deepEqual(checkDrift(base(), root).errors, []);
});

test('deliberate red: a mirror that stops citing its id, or cites an unknown id, fails', () => {
  const root = repo();
  const reg = base();
  reg.mirrors = [{ path: 'docs/m.md', ids: ['ASR-001'] }];
  put(root, 'docs/m.md', 'no ids here');
  assert.ok(
    checkDrift(reg, root).errors.some(e => e.includes('does not cite ASR-001'))
  );
  put(root, 'docs/m.md', 'ASR-001 and ASR-999');
  assert.ok(
    checkDrift(reg, root).errors.some(e => e.includes('unknown ASR-999'))
  );
});

test('the legacy ratchet only shrinks: a listed file that stopped copying fails', () => {
  const root = repo();
  put(root, LEGACY_PATH, JSON.stringify({ files: ['docs/old.md'] }));
  put(root, 'docs/old.md', 'clean');
  assert.ok(
    checkDrift(base(), root).errors.some(e => e.includes('only shrinks'))
  );
});

test('registry matchers flag lines in any file type', () => {
  const root = repo();
  put(root, 'a.html', '<p>ok</p>\n<p>bad word</p>');
  const reg = base();
  reg.rules[0].enforcement.matchers = [
    { pattern: 'bad word', files: '\\.html$' },
  ];
  const findings = runMatchers(reg, ['a.html'], root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});

test('matchers accept absolute paths (agents pass artifact paths from anywhere)', () => {
  const root = repo();
  put(root, 'abs.html', 'bad word');
  const reg = base();
  reg.rules[0].enforcement.matchers = [{ pattern: 'bad word' }];
  assert.equal(
    runMatchers(reg, [join(root, 'abs.html')], '/some/other/root').length,
    1
  );
});

test('registry path constant points at the committed file', () => {
  assert.equal(REGISTRY_PATH, 'docs/design-system/anti-slop-rules.json');
});

test('generic headings use sentence case, preserving proper names', () => {
  for (const label of [
    'Usage Stats',
    'Loading Profile Settings',
    'Open Links And Music Preview Panel',
  ])
    assert.ok(TITLE_CASE_HEADING.test(`title='${label}'`));
  for (const label of [
    'Usage stats',
    'Loading profile settings',
    'Search Jovie',
    'Open Apple Music',
    'MIDI input',
  ])
    assert.ok(!TITLE_CASE_HEADING.test(`title='${label}'`));
});

test('label ratchet permits legacy only, rejects new and duplicate hits, and requires shrinking', () => {
  const root = repo();
  const file = 'apps/web/components/shell/Player.tsx';
  const line = "<div title='Usage Stats' />";
  put(root, file, line);
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['add', '.'], { cwd: root });
  assert.equal(checkTitleCaseHeadings(root).length, 1);
  put(
    root,
    LEGACY_PATH,
    JSON.stringify({ files: [], titleCaseHeadings: [`${file}: ${line}`] })
  );
  assert.deepEqual(checkTitleCaseHeadings(root), []);
  put(root, file, `${line}\n${line}`);
  assert.equal(checkTitleCaseHeadings(root).length, 1);
  put(root, file, "<div title='Usage stats' />");
  assert.match(checkTitleCaseHeadings(root)[0], /stale baseline/u);
  put(root, LEGACY_PATH, JSON.stringify({ files: [], titleCaseHeadings: [] }));
  assert.deepEqual(checkTitleCaseHeadings(root), []);
});

test('settings and shell changes select the existing anti-slop CI lane', async () => {
  const { SOURCE_GUARDS } = await import('../ci-fast-lanes.mjs');
  const guard = SOURCE_GUARDS.find(rule => rule.id === 'anti-slop');
  for (const file of [
    'apps/web/app/app/(shell)/settings/profile/page.tsx',
    'apps/web/components/shell/SidebarInboxLink.tsx',
    'scripts/anti-slop/lib.mjs',
  ])
    assert.ok(guard.inputs.test(file), file);
});
