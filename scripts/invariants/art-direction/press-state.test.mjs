import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkPress,
  hardcodedPress,
  rawClickables,
  scanPress,
} from './press-state.mjs';

const FILE = 'apps/web/components/Example.tsx';

describe('press state', () => {
  it('flags hardcoded press scales but not the token', () => {
    const bad = [
      "<div className='active:scale-95' />",
      "<div className='hover:bg-x active:scale-[0.97]' />",
      '<m.div whileTap={{ scale: 0.9 }} />',
    ].join('\n');
    assert.equal(hardcodedPress(bad, FILE).length, 3);
    assert.deepEqual(
      hardcodedPress(
        "<div className='press active:scale-press active:scale-[var(--scale-press)]' />",
        FILE
      ),
      []
    );
  });

  it('flags a literal scale inside a :active rule in css', () => {
    const css = '.chip:active { transform: scale(0.9); }';
    assert.equal(hardcodedPress(css, 'apps/web/app/x.css').length, 1);
    assert.deepEqual(
      hardcodedPress(
        '.chip:active { scale: var(--scale-press); }\n.chip { transform: scale(0.9); }',
        'apps/web/app/x.css'
      ),
      []
    );
  });

  it('flags a raw button or role=button that skips press', () => {
    const source = [
      "export const A = () => <button type='button'>a</button>;",
      "export const B = () => <div role='button'>b</div>;",
      "export const C = () => <button className='press px-2'>c</button>;",
      'export const D = () => <PlainButton>d</PlainButton>;',
    ].join('\n');
    assert.deepEqual(rawClickables(source, FILE), [
      `raw-clickable:${FILE}#1`,
      `raw-clickable:${FILE}#2`,
    ]);
  });

  it('matches the shrink-only baseline', () => {
    assert.deepEqual(checkPress().failures, []);
  });

  it('deliberate red: a new escape fails against the baseline', () => {
    const live = scanPress();
    const result = checkPress(undefined, live.slice(1));
    assert.ok(
      result.failures.some(failure => failure.includes('baseline is missing')),
      'an id missing from the baseline must fail'
    );
    const extra = checkPress(undefined, [...live, 'raw-clickable:gone.tsx#1']);
    assert.ok(
      extra.failures.some(failure => failure.includes('can only shrink')),
      'a stale baseline id must fail until deleted'
    );
  });
});
