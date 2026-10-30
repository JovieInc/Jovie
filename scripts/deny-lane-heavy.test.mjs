import assert from 'node:assert/strict';
import { test } from 'node:test';
import { denyLaneHeavy, laneHeavyDenied } from './deny-lane-heavy.mjs';

test('lanes are denied a local build, everyone else is not', () => {
  assert.match(
    laneHeavyDenied('next build', { LANES_NO_LOCAL_BUILD: '1' }),
    /CI runs it/
  );
  assert.equal(laneHeavyDenied('next build', {}), null);
  assert.equal(
    laneHeavyDenied('next build', { LANES_NO_LOCAL_BUILD: '0' }),
    null
  );
});

test('denyLaneHeavy exits 3 for lanes and returns quietly otherwise', () => {
  let code = null;
  denyLaneHeavy('turbo build', { LANES_NO_LOCAL_BUILD: '1' }, c => (code = c));
  assert.equal(code, 3);
  code = null;
  denyLaneHeavy('turbo build', {}, c => (code = c));
  assert.equal(code, null);
});
