import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accentViolations } from './accent.mjs';
import { evaluateRatchet } from './ratchet.mjs';
import { judgeVision } from './vision.mjs';
import { checkAccent } from './accent.mjs';
import { checkVision } from './vision.mjs';

const ALLOWED = new Set(['#11afff', '#030406']);

describe('art-direction ratchet', () => {
  it('rejects a new id and a stale id', () => {
    const errors = evaluateRatchet({
      current: ['b', 'c'],
      recorded: ['a', 'b'],
      ancestor: null,
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /do not add ids/);
    assert.match(errors[1], /can only shrink/);
  });

  it('rejects an id that is absent from the ancestor baseline', () => {
    const errors = evaluateRatchet({
      current: ['a', 'b'],
      recorded: ['a', 'b'],
      ancestor: ['a'],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /new violations are not allowed/);
  });

  it('accepts an equal set and a shrink against the ancestor', () => {
    assert.deepEqual(
      evaluateRatchet({
        current: ['a'],
        recorded: ['a'],
        ancestor: ['a', 'b'],
      }),
      []
    );
  });
});

describe('one accent per marketing section', () => {
  it('requires exactly one scene role on a section', () => {
    const bare = accentViolations(
      'export function Page(){ return <section /> }',
      'apps/web/app/(marketing)/page.tsx',
      ALLOWED
    );
    assert.deepEqual(bare, [
      'missing-accent:apps/web/app/(marketing)/page.tsx',
    ]);
    const both = accentViolations(
      '<section data-accent="ion" data-accent="ultra" />',
      'apps/web/components/marketing/Both.tsx',
      ALLOWED
    );
    assert.deepEqual(both, [
      'multi-accent:apps/web/components/marketing/Both.tsx:ion+ultra',
    ]);
  });

  it('allows a token hex and flags a hex outside the token set', () => {
    const source = '.hero { color: #11afff; background: #123456; }';
    assert.deepEqual(
      accentViolations(source, 'apps/web/app/(home)/home.css', ALLOWED),
      ['hardcoded-hex:apps/web/app/(home)/home.css:#123456']
    );
  });

  it('matches the recorded marketing baseline', () => {
    const result = checkAccent();
    assert.deepEqual(result.failures, []);
  });
});

describe('vision judges', () => {
  const floors = { precisionMin: 0.9, recallMin: 0.8 };

  it('stays in shadow while promoteToBlocking is false', () => {
    const result = judgeVision({
      mode: 'shadow',
      promoteToBlocking: false,
      hamelFloors: floors,
    });
    assert.deepEqual(result.failures, []);
    assert.match(result.shadow[0], /uncalibrated/);
  });

  it('fails closed when the promote switch is flipped early', () => {
    const promoted = judgeVision({
      mode: 'shadow',
      promoteToBlocking: true,
      hamelFloors: floors,
    });
    assert.match(promoted.failures.join('\n'), /not calibrated/);
    const lowered = judgeVision({
      mode: 'shadow',
      promoteToBlocking: false,
      hamelFloors: { precisionMin: 0.5, recallMin: 0.5 },
    });
    assert.match(lowered.failures.join('\n'), /Hamel floors/);
  });

  it('reads the checked-in config as shadow', () => {
    const result = checkVision();
    assert.deepEqual(result.failures, []);
    assert.ok(result.shadow.length > 0);
  });
});
