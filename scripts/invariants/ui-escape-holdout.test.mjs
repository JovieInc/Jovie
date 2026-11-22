import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseLfsPointer } from '../lib/lfs-blobs.mjs';

// UI judge calibration set (HumanHoldoutSet v1) for vision and
// coherence judges (JOV-7713, JOV-7765). Fails render the UI escape corpus.
const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/screenshots/ui-escape-holdout'
);
const holdout = JSON.parse(readFileSync(join(root, 'holdout.json'), 'utf8'));
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

// The captures are stored in Git LFS (.gitattributes). A checkout that pulled
// LFS holds the PNG; one that did not holds the pointer, whose oid is the
// SHA-256 of the exact PNG bytes, so the byte binding holds either way. The
// pixel header is checked whenever the PNG itself is present.
function readCapture(path) {
  const data = readFileSync(path);
  const pointer = parseLfsPointer(data);
  if (pointer)
    return { sha256: pointer.oid, png: null, bytes: pointer.objectBytes };
  return {
    sha256: createHash('sha256').update(data).digest('hex'),
    png: data,
    bytes: data.length,
  };
}

function assertCaptureBytes(capture) {
  const got = readCapture(join(root, capture.file));
  assert.equal(got.sha256, capture.sha256);
  if (got.png) {
    assert.equal(got.png.readUInt32BE(16), capture.width);
    assert.equal(got.png.readUInt32BE(20), capture.height);
  }
}

describe('ui escape holdout', () => {
  it('preserves the separate fuller-page document-like rejection', () => {
    const provenance = JSON.parse(
      readFileSync(
        join(root, 'homepage-document-rejection-2026-10-22.json'),
        'utf8'
      )
    );
    const capture = provenance.negativeCapture;
    const item = holdout.items.find(item => item.id === provenance.caseId);
    assert.equal(item?.humanLabel, 'fail');
    assert.equal(item?.mustReject, true);
    assert.equal(item?.caseId, capture.file);
    assertCaptureBytes(capture);
    assert.equal(
      capture.libraryFileId,
      'libfile_6ece57e899988191829e40b555afc105'
    );
    assert.equal(
      provenance.companionCapture.libraryFileId,
      'libfile_62c14d865d748191934dabc88d0f207d'
    );
    assert.notEqual(provenance.caseId, provenance.earlierCase);
    assert.equal(
      holdout.items.find(item => item.id === provenance.earlierCase)
        ?.mustReject,
      true
    );
  });

  it('binds the required homepage rejection to the exact reviewed desktop bytes', () => {
    const provenance = JSON.parse(
      readFileSync(join(root, 'homepage-rejection-2026-10-22.json'), 'utf8')
    );
    const capture = provenance.negativeCapture;
    const item = holdout.items.find(item => item.id === provenance.caseId);
    assert.equal(item?.humanLabel, 'fail');
    assert.equal(item?.mustReject, true);
    assert.equal(item?.caseId, capture.file);
    assertCaptureBytes(capture);
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
      const got = readCapture(path);
      assert.ok(got.bytes > 0, `empty ${item.caseId}`);
      if (got.png) assert.deepEqual(got.png.subarray(0, 8), PNG);
      assert.ok(item.notes?.trim(), `${item.id} needs provenance notes`);
    }
  });
});
