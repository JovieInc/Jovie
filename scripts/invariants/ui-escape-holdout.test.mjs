import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// UI judge calibration set (HumanHoldoutSet v1) for vision and
// coherence judges (JOV-7713, JOV-7765). Fails render the UI escape corpus.
const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/screenshots/ui-escape-holdout'
);
const holdout = JSON.parse(readFileSync(join(root, 'holdout.json'), 'utf8'));
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('ui escape holdout', () => {
  it('binds the required homepage rejection to the exact reviewed desktop bytes', () => {
    const provenance = JSON.parse(
      readFileSync(join(root, 'homepage-rejection-2026-10-22.json'), 'utf8')
    );
    const capture = provenance.negativeCapture;
    const item = holdout.items.find(item => item.id === provenance.caseId);
    assert.equal(item?.humanLabel, 'fail');
    assert.equal(item?.mustReject, true);
    assert.equal(item?.caseId, capture.file);
    const png = readFileSync(join(root, capture.file));
    assert.equal(
      createHash('sha256').update(png).digest('hex'),
      capture.sha256
    );
    assert.equal(png.readUInt32BE(16), capture.width);
    assert.equal(png.readUInt32BE(20), capture.height);
    assert.equal(
      capture.libraryFileId,
      'libfile_d25051e0eca481919874b19a13d7b934'
    );
    assert.equal(
      provenance.companionCapture.libraryFileId,
      'libfile_9cc6e77b56ac819194d668b778403ed9'
    );
    assert.equal(
      provenance.authority.deliveryMessageId,
      'Sentinel_7982f0510980819194d7c49fdf1a319f'
    );
    assert.equal(
      holdout.items.find(item => item.id === 'ok-artist-profiles-390')
        ?.humanLabel,
      'pass'
    );
  });

  it('is a HumanHoldoutSet v1 with at least ten labels of each kind', () => {
    assert.equal(holdout.schemaVersion, 1);
    assert.ok(Number.isFinite(Date.parse(holdout.labeledAt)));
    const count = label =>
      holdout.items.filter(item => item.humanLabel === label).length;
    assert.ok(count('fail') >= 10, `fail=${count('fail')}`);
    assert.ok(count('pass') >= 10, `pass=${count('pass')}`);
    assert.equal(count('fail') + count('pass'), holdout.items.length);
  });

  it('binds every item to a unique, real PNG next to the file', () => {
    const ids = new Set();
    for (const item of holdout.items) {
      assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
      ids.add(item.id);
      assert.match(item.caseId, /^[a-z0-9-]+\.png$/);
      const path = join(root, item.caseId);
      assert.ok(existsSync(path), `missing ${item.caseId}`);
      assert.deepEqual(readFileSync(path).subarray(0, 8), PNG);
      assert.ok(item.notes?.trim(), `${item.id} needs provenance notes`);
    }
  });
});
