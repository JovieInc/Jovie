import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonical } from '../canonical-json.mjs';

describe('canonical JSON for signed Summer payloads', () => {
  it('sorts keys with localeCompare at every depth and keeps array order', () => {
    assert.equal(
      canonical({ b: 1, a: [{ z: null, y: 'x' }, 2], C: true }),
      '{"a":[{"y":"x","z":null},2],"b":1,"C":true}'
    );
  });

  it('serializes scalars exactly like JSON.stringify', () => {
    assert.equal(canonical('é\n'), '"é\\n"');
    assert.equal(canonical(1.5), '1.5');
    assert.equal(canonical(null), 'null');
  });
});
