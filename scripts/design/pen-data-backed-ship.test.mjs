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
  PEN_DATA_BACKED_SHIP_SCHEMA,
  validateDataBackedShipReceipt,
} from './pen-data-backed-ship-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-data-backed-ship.mjs');

describe('pen-data-backed-ship', () => {
  it('detects .pen blobs and ignores stills/bindings', () => {
    assert.equal(isPenBlobPath('docs/foo.pen'), true);
    assert.equal(isPenBlobPath('docs/pen-stills/home/390/hero.png'), false);
    assert.equal(isPenBlobPath('docs/design-system/pen-bindings.json'), false);

    const blocked = checkChangedPathsForPenBlobs([
      'docs/design-system/DATA_BACKED_SHIP_PATH.md',
      'scratch/canonical.lib.pen',
      'apps/web/components/Button.tsx',
    ]);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.penBlobs, ['scratch/canonical.lib.pen']);

    const clean = checkChangedPathsForPenBlobs([
      'docs/design-system/DATA_BACKED_SHIP_PATH.md',
      'scripts/design/pen-data-backed-ship-lib.mjs',
    ]);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.penBlobs, []);
  });

  it('validates the pilot receipt and rejects pen-through-CI shapes', () => {
    const ok = validateDataBackedShipReceipt(buildPilotShipReceipt());
    assert.equal(ok.ok, true);
    assert.equal(ok.schema, PEN_DATA_BACKED_SHIP_SCHEMA);

    const withPen = validateDataBackedShipReceipt(
      buildPilotShipReceipt({
        codeSyncPaths: ['design/canvas.pen', 'packages/ui/src/button.tsx'],
      })
    );
    assert.equal(withPen.ok, false);
    assert.ok(
      withPen.blockers.some(blocker => blocker.code === 'code_sync_contains_pen')
    );

    const noPersist = validateDataBackedShipReceipt(
      buildPilotShipReceipt({ livePersist: undefined })
    );
    assert.equal(noPersist.ok, false);
    assert.ok(
      noPersist.blockers.some(blocker => blocker.code === 'live_persist_missing')
    );
  });

  it('CLI check fails on a changed-files list that includes .pen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pen-ship-'));
    const list = join(dir, 'changed.txt');
    writeFileSync(
      list,
      'docs/design-system/DATA_BACKED_SHIP_PATH.md\nworkspace/foo.pen\n'
    );
    const run = spawnSync(
      process.execPath,
      [CLI, 'check', '--changed-files', list],
      { encoding: 'utf8' }
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
    assert.equal(/\.pen"/.test(run.stdout), false);
  });
});
