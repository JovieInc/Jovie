import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from './pen-data-backed-ship.mjs';
import {
  buildPilotShipReceipt,
  checkChangedPathsForPenBlobs,
  isPenBlobPath,
  normalizeGitPath,
  PEN_DATA_BACKED_SHIP_SCHEMA,
  validateDataBackedShipReceipt,
} from './pen-data-backed-ship-lib.mjs';

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  'pen-data-backed-ship.mjs'
);

describe('pen-data-backed-ship', () => {
  it('detects .pen blobs and ignores stills/bindings', () => {
    assert.equal(isPenBlobPath('docs/foo.pen'), true);
    assert.equal(isPenBlobPath('docs/pen-stills/home/390/hero.png'), false);
    const blocked = checkChangedPathsForPenBlobs([
      'docs/x.md',
      'scratch/canonical.lib.pen',
    ]);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.penBlobs, ['scratch/canonical.lib.pen']);
    assert.equal(checkChangedPathsForPenBlobs(['docs/x.md']).ok, true);
  });

  it('still flags C-quoted git paths (core.quotePath)', () => {
    const quoted = '"designs/caf\\303\\251.pen"';
    assert.equal(normalizeGitPath(quoted), 'designs/café.pen');
    assert.equal(isPenBlobPath(quoted), true);
    const blocked = checkChangedPathsForPenBlobs(['docs/x.md', quoted]);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.penBlobs, ['designs/café.pen']);
  });

  it('validates pilot receipt and rejects .pen in codeSyncPaths', () => {
    const ok = validateDataBackedShipReceipt(buildPilotShipReceipt());
    assert.equal(ok.ok, true);
    assert.equal(ok.schema, PEN_DATA_BACKED_SHIP_SCHEMA);
    const bad = validateDataBackedShipReceipt(
      buildPilotShipReceipt({ codeSyncPaths: ['design/canvas.pen'] })
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.blockers.some(b => b.code === 'code_sync_contains_pen'));
  });

  it('CLI check fails when changed-files lists a .pen', () => {
    const list = join(mkdtempSync(join(tmpdir(), 'pen-ship-')), 'changed.txt');
    writeFileSync(list, 'docs/x.md\nworkspace/foo.pen\n');
    const run = spawnSync(
      process.execPath,
      [CLI, 'check', '--changed-files', list],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(run.status, 1);
    assert.match(run.stdout, /pen_blob_in_diff/);
  });

  it('CLI pilot exits 0 without .pen blobs', () => {
    assert.equal(main(['pilot']), 0);
    const run = spawnSync(process.execPath, [CLI, 'pilot'], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /disk_persist_verified/);
  });
});
