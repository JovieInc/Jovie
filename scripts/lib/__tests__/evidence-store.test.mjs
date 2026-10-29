import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateCertificationEntry } from '../../design-surface-census.mjs';
import { recertify } from '../../design-surface-recertify.mjs';
import {
  findBannedEvidenceBinaries,
  parseNameStatus,
} from '../../evidence-binary-guard.mjs';
import {
  buildPointer,
  isBannedEvidenceBinary,
  validatePointer,
  verifyBytes,
} from '../evidence-store.mjs';

const bytes = Buffer.from('png-bytes');
const pointer = () =>
  buildPointer({
    bytes,
    extension: '.png',
    viewport: '1440x900',
    capturedAt: '2026-10-29T00:00:00Z',
  });

test('pointers are content addressed and verify against bytes', () => {
  const p = pointer();
  assert.deepEqual(validatePointer(p, Date.parse('2026-10-30')), []);
  assert.deepEqual(verifyBytes(p, bytes), []);
  assert.deepEqual(verifyBytes(p, Buffer.from('other')), [
    'size mismatch',
    'sha256 mismatch',
  ]);
  assert.ok(validatePointer({ ...p, sha256: 'a'.repeat(64) }).length > 0);
  assert.ok(validatePointer({ ...p, url: 'https://x.test/a.png' }).length > 0);
});

test('certification needs a fingerprint and a capture per viewport', () => {
  const entry = {
    sourceDigest: 'a'.repeat(64),
    certifiedAt: '2026-10-29T00:00:00Z',
    captures: [pointer()],
  };
  assert.throws(
    () => validateCertificationEntry('s', entry, ['desktop', 'mobile']),
    /mobile capture/
  );
  validateCertificationEntry('s', entry, ['desktop']);
  assert.throws(
    () => validateCertificationEntry('s', { ...entry, sourceDigest: '' }),
    /sourceDigest/
  );
});

test('the ratchet bans new evidence binaries but not corpora, pointers or deletes', () => {
  assert.ok(isBannedEvidenceBinary('docs/screenshots/x/a.png'));
  assert.ok(!isBannedEvidenceBinary('docs/screenshots/x/a.png.evidence.json'));
  assert.ok(
    !isBannedEvidenceBinary('docs/screenshots/ui-escape-holdout/a.png')
  );
  assert.ok(!isBannedEvidenceBinary('apps/web/public/a.png'));
  const changes = parseNameStatus(
    'A\tdocs/screenshots/x/a.jpg\nD\tdocs/screenshots/x/b.png\nM\tapps/web/public/c.png\n'
  );
  assert.deepEqual(findBannedEvidenceBinaries(changes), [
    'docs/screenshots/x/a.jpg',
  ]);
});

test('recertify is exported for the bot', () => {
  assert.equal(typeof recertify, 'function');
});
