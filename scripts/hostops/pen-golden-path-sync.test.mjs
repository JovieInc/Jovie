import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  archiveFiles,
  fingerprint,
  PEN_FILES,
  sync,
} from './pen-golden-path-sync.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pen-sync-'));
  const workspace = join(root, 'ws');
  mkdirSync(join(workspace, 'fonts'), { recursive: true });
  mkdirSync(join(workspace, 'huge-unrelated'), { recursive: true });
  for (const name of PEN_FILES)
    writeFileSync(join(workspace, name), `pen:${name}`);
  writeFileSync(join(workspace, 'fonts/a.woff2'), 'font');
  writeFileSync(join(workspace, 'huge-unrelated/big.bin'), 'x');
  return { workspace, state: join(root, 'state') };
}

// The fake tar writes the archive; the fake wrangler records its args.
function runner(calls) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'tar') writeFileSync(args[1], 'archive-bytes');
    return Buffer.alloc(0);
  };
}

test('archive holds pen files and asset folders only', () => {
  const { workspace } = fixture();
  const files = archiveFiles(workspace);
  assert.ok(files.includes('fonts/a.woff2'));
  assert.ok(!files.some(f => f.startsWith('huge-unrelated')));
  assert.equal(files.filter(f => f.endsWith('.pen')).length, PEN_FILES.length);
});

test('missing pen file fails loudly', () => {
  const { workspace } = fixture();
  writeFileSync(join(workspace, PEN_FILES[0]), 'x');
  const empty = mkdtempSync(join(tmpdir(), 'pen-sync-empty-'));
  assert.throws(() => archiveFiles(empty), /missing pen file/);
});

test('uploads once, skips when unchanged, re-uploads on change, keeps the same key', () => {
  const { workspace, state } = fixture();
  const calls = [];
  const run = runner(calls);
  const first = sync({ workspace, state, run });
  assert.equal(first.result, 'uploaded');
  assert.equal(first.archiveSha256.length, 64);
  for (const stage of ['start', 'detected', 'archived', 'uploaded'])
    assert.ok(first.stages[stage]);
  const put = calls.find(c => c.includes('put'));
  assert.ok(put.includes('--remote'));
  assert.match(
    put.find(a => a.startsWith('jovie-pen-golden-path/')),
    /^jovie-pen-golden-path\/[0-9a-f]{32}\/workspace\.tar\.gz$/
  );
  const key = readFileSync(join(state, 'object-key'), 'utf8');

  const n = calls.length;
  assert.equal(sync({ workspace, state, run }).result, 'unchanged');
  assert.equal(calls.length, n);

  writeFileSync(join(workspace, PEN_FILES[0]), 'edited');
  assert.equal(sync({ workspace, state, run }).result, 'uploaded');
  assert.equal(readFileSync(join(state, 'object-key'), 'utf8'), key);
  assert.ok(existsSync(join(state, 'ledger.jsonl')));
});

test('asset mtime change alters the fingerprint; dry-run and kill switch never upload', () => {
  const { workspace, state } = fixture();
  const files = archiveFiles(workspace);
  const before = fingerprint(workspace, files);
  utimesSync(
    join(workspace, 'fonts/a.woff2'),
    new Date(),
    new Date(Date.now() + 5000)
  );
  assert.notEqual(fingerprint(workspace, files), before);
  const calls = [];
  assert.equal(
    sync({ workspace, state, run: runner(calls), dryRun: true }).result,
    'dry-run'
  );
  assert.ok(!calls.some(c => c.includes('put')));
  writeFileSync(join(state, 'disabled'), '');
  assert.equal(
    sync({ workspace, state, run: runner(calls) }).result,
    'disabled'
  );
});
