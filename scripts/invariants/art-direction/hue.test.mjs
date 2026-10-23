import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkHue, hueViolations, isOrangeHex } from './hue.mjs';

describe('marketing hue', () => {
  it('flags orange and ignores an accent role', () => {
    assert.equal(isOrangeHex('#ff7800'), true);
    assert.equal(isOrangeHex('#11afff'), false);
    assert.equal(isOrangeHex('#5c4033'), false);
  });

  it('flags a literal triad in one rule and an orange hex', () => {
    const css =
      '.all { color: #3faff3; background: #a789f0; border-color: #eb6ac6; } .sun { color: #ff7800; }';
    const ids = hueViolations(css, 'apps/web/components/marketing/sample.css');
    assert.ok(ids.some(id => id.startsWith('triad:')));
    assert.ok(
      ids.includes('orange:apps/web/components/marketing/sample.css:#ff7800')
    );
  });

  it('matches the shrink-only baseline', () => {
    assert.deepEqual(checkHue().failures, []);
  });
});
