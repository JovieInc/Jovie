import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { certifyComponent } from '../component-certificate.mjs';
import {
  countForcedCaps,
  countForcedCapsInLine,
  findForcedCaps,
  isForcedCapsElement,
} from '../design-rules/forced-caps.mjs';

describe('forced-caps rule', () => {
  it('counts the utility, CSS and inline forms but not comments or names', () => {
    assert.equal(countForcedCapsInLine("className='text-xs uppercase'"), 1);
    assert.equal(countForcedCapsInLine('  text-transform: uppercase;'), 1);
    assert.equal(
      countForcedCapsInLine("style={{ textTransform: 'uppercase' }}"),
      1
    );
    assert.equal(countForcedCapsInLine(' * uppercase is banned'), 0);
    assert.equal(countForcedCapsInLine('// uppercase is banned'), 0);
    assert.equal(countForcedCapsInLine('value.toUpperCase()'), 0);
    assert.equal(countForcedCapsInLine("className='not-uppercase-x'"), 0);
    assert.equal(countForcedCapsInLine('const uppercaseLabel = 1;'), 0);
  });

  it('finds every line and totals repeats on one line', () => {
    const source = [
      'export function Tag() {',
      "  return <span className='uppercase'>x</span>;",
      '  // uppercase',
      "  const s = { a: 'uppercase', b: 'uppercase' };",
      '}',
    ].join('\n');
    assert.deepEqual(findForcedCaps(source), [
      { line: 2, count: 1 },
      { line: 4, count: 2 },
    ]);
    assert.equal(countForcedCaps(source), 3);
  });

  it('flags a visible rendered element with its own text in caps', () => {
    assert.equal(
      isForcedCapsElement({ textTransform: 'uppercase', ownText: 'New' }),
      true
    );
    assert.equal(
      isForcedCapsElement({ textTransform: 'none', ownText: 'New' }),
      false
    );
    assert.equal(
      isForcedCapsElement({ textTransform: 'uppercase', ownText: '  ' }),
      false
    );
    assert.equal(
      isForcedCapsElement({
        textTransform: 'uppercase',
        display: 'none',
        ownText: 'New',
      }),
      false
    );
    assert.equal(
      isForcedCapsElement({
        textTransform: 'uppercase',
        visibility: 'hidden',
        ownText: 'New',
      }),
      false
    );
  });

  it('is a certificate criterion that fails with the lines to fix', () => {
    const path = 'apps/web/components/atoms/Tag.tsx';
    const shouting = certifyComponent({
      path,
      source:
        "export function Tag() { return <span className='uppercase'>x</span>; }\n",
    });
    const row = /** @type {any} */ (
      shouting.criteria.find(c => c.id === 'forced-caps')
    );
    assert.equal(row.status, 'fail');
    assert.deepEqual(row.lines, [1]);
    assert.match(
      shouting.missing.find(m => m.criterion === 'forced-caps').reason,
      /line 1/
    );
    const calm = certifyComponent({
      path,
      source:
        '// no uppercase here\nexport function Tag() { return <span>x</span>; }\n',
    });
    assert.equal(
      calm.criteria.find(c => c.id === 'forced-caps').status,
      'pass'
    );
    assert.equal(
      calm.missing.some(m => m.criterion === 'forced-caps'),
      false
    );
  });
});
