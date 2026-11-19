import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { gate as lintGate } from './pr-body-lint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'pr-body-lint.mjs');

// 02-pr-open.mjs.diff (other JOV-13091 lane) will make pr-open.gate the same
// export as pr-body-lint.gate. Until then, assert the body check is identical
// so the two cannot drift: same source, and the same verdicts on shared cases.
test('pr-open and pr-body-lint body gates agree (identical check; 02 shares the export)', async () => {
  const { gate: openGate } = await import('./pr-open.mjs');
  const openSrc = readFileSync(join(here, 'pr-open.mjs'), 'utf8');
  const lintSrc = readFileSync(join(here, 'pr-body-lint.mjs'), 'utf8');
  const extract = src => src.match(/^export function gate\([\s\S]+?^}\n/m)[0];
  assert.equal(extract(openSrc), extract(lintSrc));
  const cases = [
    { title: 'fix: x', body: 'nothing', labels: [], files: [] },
    {
      title: 'docs: x',
      body: '## Blast radius\n- What could break: <describe>\n- Proof: ok\n',
      labels: [],
      files: [],
    },
    {
      title: 'docs: tidy',
      body: '## Blast radius\n- What could break: nothing else\n- Proof: unit tests pass\n',
      labels: [],
      files: [],
    },
    {
      title: 'fix: x',
      body: 'nothing',
      labels: [],
      files: [],
      extra: ['custom'],
    },
  ];
  for (const input of cases) {
    assert.deepEqual(openGate(input), lintGate(input));
  }
});

function run(args, body) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-cli-'));
  const file = join(dir, 'body.md');
  writeFileSync(file, body);
  return spawnSync(process.execPath, [cli, '--body-file', file, ...args], {
    encoding: 'utf8',
    cwd: here,
  });
}

test('repair PR without Red-before-green exits 1 locally, naming the rule', () => {
  const r = run(['--title', 'fix: x', '--fleet-only'], 'nothing');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /red-before-green/);
  assert.match(r.stderr, /Fix: /);
});

test('placeholder rule (pr-open only) is part of the default gate', () => {
  const r = run(
    ['--title', 'docs: x'],
    '## Blast radius\n- What could break: <describe>\n- Proof: ok\n'
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /placeholder: replace <describe>/);
});

test('body over the GitHub limit is rejected before evaluation', () => {
  const r = run(['--title', 'docs: x'], 'a'.repeat(65_537));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /GitHub rejects PR bodies over 65536/);
});

test('--json prints machine-readable findings', () => {
  const r = run(['--title', 'fix: x', '--fleet-only', '--json'], 'nothing');
  const out = JSON.parse(r.stdout);
  assert.ok(out.errors.some(e => e.startsWith('red-before-green:')));
});
