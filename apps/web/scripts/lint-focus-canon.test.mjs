import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  collect,
  compareToBaseline,
  countsOf,
  findOffenders,
  shrinkNotices,
} from './lint-focus-canon.mjs';

describe('findOffenders', () => {
  it('flags ad hoc focus rings, outlines, borders and shadows', () => {
    const src = `<button className='rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus:outline-none focus-visible:border-focus dark:focus-visible:shadow-lg focus-within:ring-1 group-focus-visible:ring-2' />`;
    expect(findOffenders(src).map(o => o.snippet)).toEqual([
      'focus-visible:ring-2',
      'focus-visible:ring-offset-2',
      'focus:outline-none',
      'focus-visible:border-focus',
      'dark:focus-visible:shadow-lg',
      'focus-within:ring-1',
      'group-focus-visible:ring-2',
    ]);
  });

  it('flags the legacy focus utilities', () => {
    expect(
      findOffenders(`<a className='focus-ring-themed px-2' />`)
    ).toHaveLength(1);
    expect(findOffenders(`cn('input-focus-glow', x)`)).toHaveLength(1);
  });

  it('ignores a legacy name that appears only in a comment', () => {
    const src = `/**
 * an always-on clip cut the ring of
 * \`focus-ring-themed\` off the first control.
 */
export const stage = 'overflow-hidden';
// focus-ring-themed
const box = 'size-7'; /* input-focus-glow */`;
    expect(findOffenders(src)).toEqual([]);
  });

  it('counts a string token once when a comment repeats it', () => {
    expect(
      findOffenders(`const c = 'focus-ring-themed'; // focus-ring-themed\n`)
    ).toEqual([{ line: 1, snippet: 'focus-ring-themed' }]);
  });

  it('counts a template token and ignores a comment inside the interpolation', () => {
    const src = 'const c = `focus-ring-themed ${/* focus-ring */ ""}`;\n';
    expect(findOffenders(src).map(item => item.snippet)).toEqual([
      'focus-ring-themed',
    ]);
  });

  it('leaves non-focus classes, focus backgrounds and peer cues alone', () => {
    expect(
      findOffenders(
        `<button className='ring-1 ring-subtle focus-visible:bg-surface-1 outline-none peer-focus-visible:ring-2' data-focus-container />`
      )
    ).toEqual([]);
  });

  it('flags CSS focus rules that paint their own indicator', () => {
    const css = `.a:focus-visible { box-shadow: 0 0 0 2px red; }
.b:hover { outline: 1px solid red; }
/* .c:focus-visible { outline: none } */
.d:focus-visible { text-decoration: underline; }
.e { @apply focus-visible:ring-2; }`;
    expect(findOffenders(css, { css: true })).toEqual([
      { line: 1, snippet: '.a:focus-visible' },
      { line: 5, snippet: 'focus-visible:ring-2' },
    ]);
  });
});

describe('compareToBaseline', () => {
  it('fails a new offender (deliberate red)', () => {
    const problems = compareToBaseline({ 'a.tsx': 1 }, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/styles\/focus\.css/);
  });

  it('fails growth in a baselined file', () => {
    expect(compareToBaseline({ 'a.tsx': 3 }, { 'a.tsx': 2 })).toHaveLength(1);
  });

  it('passes at or below baseline and notices shrink', () => {
    expect(compareToBaseline({ 'a.tsx': 1 }, { 'a.tsx': 2 })).toEqual([]);
    expect(shrinkNotices({}, { 'a.tsx': 2 })).toHaveLength(1);
  });
});

describe('repository baseline', () => {
  it('is current: no file holds more ad hoc focus styles than baselined', {
    timeout: 60_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const counts = countsOf(collect());
    expect(compareToBaseline(counts, baseline.files)).toEqual([]);
    expect(Object.keys(baseline)).toEqual(['files']);
  });
});
