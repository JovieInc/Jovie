import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPenLiveCanvasPersistReceipt,
  exitCodeForPenLiveCanvasPersist,
  PEN_LIVE_CANVAS_PERSIST_SCHEMA,
} from './pen-live-canvas-persist-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-live-canvas-persist.mjs');
const CANONICAL = join(
  homedir(),
  'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen'
);
const SECOND_FILE = join(
  homedir(),
  'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — nightly.pen'
);

/** Tonight's live-canvas failure: save() said Saved, disk stayed put. */
const TONIGHT_MTIME = '2026-08-14T06:09:00.000Z';
const TONIGHT_SIZE = 13_592_453;

function attachInput(overrides = {}) {
  return {
    phase: 'attach',
    workspaceProfile: 'jovie-founder-design-studio',
    lockedExpectedPath: CANONICAL,
    activePath: CANONICAL,
    attachMode: 'desktop',
    writer: 'agent-veronica',
    batchId: 'jov-5069-live-canvas',
    dirtyState: 'dirty',
    recordedAt: '2026-08-14T08:10:00.000Z',
    ...overrides,
  };
}

function persistInput(overrides = {}) {
  return {
    ...attachInput({
      phase: 'persist',
      dirtyState: 'dirty',
      saveMethod: 'save()',
      saveAcknowledged: true,
      saveResponse: 'Saved',
      mtimeBefore: TONIGHT_MTIME,
      mtimeAfter: '2026-08-14T08:11:00.000Z',
      sizeBefore: TONIGHT_SIZE,
      sizeAfter: TONIGHT_SIZE + 2048,
      recordedAt: '2026-08-14T08:11:01.000Z',
    }),
    ...overrides,
  };
}

test('attach to a dirty live canvas is valid work, not a bail', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(attachInput());
  assert.equal(receipt.schema, PEN_LIVE_CANVAS_PERSIST_SCHEMA);
  assert.equal(receipt.verdict, 'live_canvas_attached');
  assert.equal(receipt.dirty_or_unsaved_is_bail, false);
  assert.equal(receipt.dirty_state, 'dirty');
  assert.deepEqual(receipt.blockers, []);
  assert.equal(exitCodeForPenLiveCanvasPersist(receipt), 0);
});

test('headless --out is a second file and cannot attach', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(
    attachInput({
      attachMode: 'headless',
      outPath: SECOND_FILE,
    })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['attach_mode_invalid', 'second_file_forbidden']
  );
});

test('regression: save() Saved with frozen 2026-08-13 23:09 PT mtime is not persist', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(
    persistInput({
      mtimeAfter: TONIGHT_MTIME,
      sizeAfter: TONIGHT_SIZE,
    })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.equal(receipt.disk.mtime_moved, false);
  assert.equal(receipt.disk.size_before, TONIGHT_SIZE);
  assert.equal(receipt.disk.size_after, TONIGHT_SIZE);
  assert.ok(
    receipt.blockers.some(blocker => blocker.code === 'disk_mtime_unchanged')
  );
  assert.equal(exitCodeForPenLiveCanvasPersist(receipt), 1);
});

test('save() on the attached live canvas persists when canonical mtime moves', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(persistInput());
  assert.equal(receipt.verdict, 'disk_persist_verified');
  assert.equal(receipt.disk.mtime_moved, true);
  assert.equal(receipt.durability, 'not_proven');
  assert.deepEqual(receipt.blockers, []);
  assert.equal(exitCodeForPenLiveCanvasPersist(receipt), 0);
});

test('save({path}) is unknown and must not invent a second file', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(
    persistInput({
      saveMethod: 'save({path})',
      saveArgument: '{path:"/tmp/other.pen"}',
    })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.ok(
    receipt.blockers.some(
      blocker => blocker.code === 'save_path_argument_unknown'
    )
  );
});

test('copying a Pencil backup over the live file is forbidden', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(
    persistInput({ persistSource: 'backup-copy' })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.ok(
    receipt.blockers.some(
      blocker => blocker.code === 'backup_overlay_forbidden'
    )
  );
});

test('a side-file active path cannot become the persist target', () => {
  const receipt = buildPenLiveCanvasPersistReceipt(
    persistInput({ activePath: SECOND_FILE })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.ok(
    receipt.blockers.some(blocker => blocker.code === 'active_path_mismatch')
  );
});

test('CLI attach on dirty canonical exits 0', () => {
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      '--phase',
      'attach',
      '--profile',
      'jovie-founder-design-studio',
      '--active-path',
      CANONICAL,
      '--attach-mode',
      'desktop',
      '--writer',
      'agent-veronica',
      '--batch-id',
      'jov-5069-live-canvas',
      '--dirty-state',
      'dirty',
      '--recorded-at',
      '2026-08-14T08:10:00.000Z',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.verdict, 'live_canvas_attached');
  assert.equal(receipt.expected_path, CANONICAL);
});

test('CLI persist rejects tonight’s frozen mtime Saved claim', () => {
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      '--phase',
      'persist',
      '--profile',
      'jovie-founder-design-studio',
      '--active-path',
      CANONICAL,
      '--attach-mode',
      'desktop',
      '--writer',
      'agent-veronica',
      '--batch-id',
      'jov-5069-live-canvas',
      '--save-method',
      'save()',
      '--save-acknowledged',
      'true',
      '--save-response',
      'Saved',
      '--mtime-before',
      TONIGHT_MTIME,
      '--mtime-after',
      TONIGHT_MTIME,
      '--size-before',
      String(TONIGHT_SIZE),
      '--size-after',
      String(TONIGHT_SIZE),
      '--recorded-at',
      '2026-08-14T08:11:01.000Z',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.verdict, 'blocked');
  assert.ok(
    receipt.blockers.some(blocker => blocker.code === 'disk_mtime_unchanged')
  );
});

test('CLI persist passes when canonical mtime moves', () => {
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      '--phase',
      'persist',
      '--profile',
      'jovie-founder-design-studio',
      '--active-path',
      CANONICAL,
      '--attach-mode',
      'desktop',
      '--writer',
      'agent-veronica',
      '--batch-id',
      'jov-5069-live-canvas',
      '--save-method',
      'save()',
      '--save-acknowledged',
      'true',
      '--save-response',
      'Saved',
      '--mtime-before',
      TONIGHT_MTIME,
      '--mtime-after',
      '2026-08-14T08:11:00.000Z',
      '--size-before',
      String(TONIGHT_SIZE),
      '--size-after',
      String(TONIGHT_SIZE + 2048),
      '--recorded-at',
      '2026-08-14T08:11:01.000Z',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.verdict, 'disk_persist_verified');
});

test('CLI exits 2 with JSON for an unknown profile', () => {
  const result = spawnSync(
    process.execPath,
    [CLI, '--phase', 'attach', '--profile', 'not-a-profile'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).verdict, 'error');
});
