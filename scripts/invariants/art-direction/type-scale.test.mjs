import assert from 'node:assert/strict';
import test from 'node:test';
import { check as checkImagery, scanSidecar } from './imagery-tags.mjs';
import { CAP_PX, check as checkType, scanTypeScale } from './type-scale.mjs';

test('the repo is clean today', () => {
  assert.deepEqual(checkType().failures, []);
  assert.deepEqual(checkImagery().failures, []);
});

test('deliberate red: billboard type above the cap fails in css and tailwind', () => {
  assert.equal(CAP_PX, 80);
  assert.equal(scanTypeScale('h1 { font-size: 96px; }').length, 1);
  assert.equal(
    scanTypeScale('h1 { font-size: clamp(3rem, 8vw, 7rem); }').length,
    1
  );
  assert.equal(scanTypeScale('<h1 className="text-8xl">').length, 1);
  assert.equal(scanTypeScale('<h1 className="text-[120px]">').length, 1);
});

test('restrained sizes pass, including the current 80px hero max', () => {
  assert.equal(
    scanTypeScale('h1 { font-size: clamp(4rem, 5.56vw, 5rem); }').length,
    0
  );
  assert.equal(
    scanTypeScale('<h1 className="text-5xl text-[2.5rem] text-7xl">').length,
    0
  );
  assert.equal(
    scanTypeScale('/* font-size: 200px */ p { font-size: 16px }').length,
    0
  );
});

test('deliberate red: banned music-cliche imagery in a sidecar fails; abstract plates pass', () => {
  for (const word of [
    'microphone',
    'headphones',
    'DJ decks',
    'vinyl',
    'guitar',
    'on stage',
    'concert crowd',
    'turntable',
  ]) {
    assert.ok(
      scanSidecar(JSON.stringify({ subject: `warm photo of ${word}` })),
      word
    );
  }
  assert.equal(
    scanSidecar(JSON.stringify({ kind: 'mood-plate', accent: 'ion' })),
    null
  );
});
