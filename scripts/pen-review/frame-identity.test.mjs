import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frameDigest,
  isProposalFrame,
  markReady,
  stripReady,
} from './frame-identity.mjs';

test('proposal matcher, ready marker and digest', () => {
  assert.ok(isProposalFrame({ name: 'PROPOSAL / Network CRM · S1' }));
  assert.ok(
    isProposalFrame({
      name: 'App / Chat / Assembling profile · 1 early · PROPOSAL',
    })
  );
  assert.ok(
    !isProposalFrame({ name: 'PROPOSAL AREA · Jovie marketing family' })
  );
  const marked = markReady('PROPOSAL / A', 'abcdef0123456789');
  assert.equal(marked, 'PROPOSAL / A · ready for Tim rabcdef01');
  assert.equal(stripReady(marked), 'PROPOSAL / A');
  assert.equal(
    frameDigest({ name: 'a', x: 1, children: [{ id: 'q' }] }),
    frameDigest({ x: 1, name: 'b', children: [{ id: 'q' }] })
  );
  assert.notEqual(frameDigest({ x: 1 }), frameDigest({ x: 2 }));
});
