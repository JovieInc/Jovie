import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { check, readTasteLabels, validateRow } from './taste-labels.mjs';

const good = {
  id: 'some-frame',
  surface: 'homepage',
  verdict: 'reject',
  words: 'cheap',
  wordsSource: 'chat',
  rules: ['ASR-023'],
  imageStatus: 'unrecoverable',
  imageNote: 'gone',
  judgeLabels: [],
};

test("the checked-in dataset validates and carries tonight's seed cases", () => {
  assert.deepEqual(check().failures, []);
  const ids = readTasteLabels().map(r => r.id);
  for (const id of [
    'stage-mic-homepage-pass',
    'woman-portrait-homepage',
    'oversized-marketing-type',
    'artist-first-homepage-reclassified',
    'desktop-profile-a3',
    'dial-final',
    'release-hero-square-cover',
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(
    readTasteLabels().some(r => r.verdict === 'approve') &&
      readTasteLabels().some(r => r.verdict === 'reject')
  );
});

test("deliberate red: a label without Tim's words, a verdict, or a reason for a missing image fails", () => {
  const root = mkdtempSync(join(tmpdir(), 'taste-'));
  assert.deepEqual(validateRow(good, root), []);
  assert.ok(validateRow({ ...good, words: '' }, root).length);
  assert.ok(validateRow({ ...good, verdict: 'meh' }, root).length);
  assert.ok(validateRow({ ...good, imageNote: '' }, root).length);
  assert.ok(validateRow({ ...good, rules: ['nope'] }, root).length);
  assert.ok(
    validateRow(
      { ...good, image: 'docs/x.jpg', imageStatus: undefined },
      root
    ).some(e => e.includes('image missing'))
  );
  assert.ok(
    validateRow(
      { ...good, judgeLabels: [{ criterion: 'vibes', truth: 'defect' }] },
      root
    ).length
  );
});

test('unknown rule ids fail when the registry exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'taste-'));
  mkdirSync(join(root, 'docs/design-system'), { recursive: true });
  writeFileSync(
    join(root, 'docs/design-system/anti-slop-rules.json'),
    JSON.stringify({ rules: [{ id: 'ASR-001' }] })
  );
  assert.ok(
    validateRow({ ...good, rules: ['ASR-023'] }, root).some(e =>
      e.includes('unknown rule')
    )
  );
  assert.deepEqual(validateRow({ ...good, rules: ['ASR-001'] }, root), []);
});
