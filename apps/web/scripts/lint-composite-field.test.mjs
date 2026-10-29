import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  collect,
  compareToBaseline,
  countsOf,
  findOffenders,
  shrinkNotices,
} from './lint-composite-field.mjs';

describe('findOffenders', () => {
  it('flags an input that drops its own focus outside CompositeField', () => {
    const src = `<div className='rounded-full'><input className='bg-transparent outline-none' /></div>`;
    expect(findOffenders(src)).toHaveLength(1);
  });

  it('flags focus-visible:ring-0 on an Input', () => {
    expect(
      findOffenders(`<Input className='border-0 focus-visible:ring-0' />`)
    ).toHaveLength(1);
  });

  it('allows the same input inside CompositeField', () => {
    const src = `import { CompositeField } from '@jovie/ui/atoms/composite-field';
<CompositeField><input className='bg-transparent outline-none' /></CompositeField>`;
    expect(findOffenders(src)).toHaveLength(0);
  });

  it('allows an input that paints its own ring', () => {
    expect(
      findOffenders(
        `<input className='focus-visible:outline-none focus-visible:ring-2' />`
      )
    ).toHaveLength(0);
  });
});

describe('compareToBaseline', () => {
  it('fails a new offender (deliberate red)', () => {
    expect(compareToBaseline({ 'a.tsx': 1 }, {})).toHaveLength(1);
  });

  it('fails growth past the baseline', () => {
    expect(compareToBaseline({ 'a.tsx': 3 }, { 'a.tsx': 2 })).toHaveLength(1);
  });

  it('passes a shrink with a notice', () => {
    expect(compareToBaseline({}, { 'a.tsx': 1 })).toEqual([]);
    expect(shrinkNotices({}, { 'a.tsx': 1 })).toHaveLength(1);
  });

  it('passes when counts equal the baseline', () => {
    expect(compareToBaseline({ 'a.tsx': 2 }, { 'a.tsx': 2 })).toEqual([]);
  });
});

describe('repository state', () => {
  it('never exceeds the committed baseline', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files;
    expect(compareToBaseline(countsOf(collect()), baseline)).toEqual([]);
  });
});
