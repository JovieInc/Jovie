import { describe, expect, it } from 'vitest';
import {
  parseSummerProgress,
  type SummerProgressPart,
  summerProgressLines,
} from './summer-progress';

describe('parseSummerProgress', () => {
  it('accepts only well-formed parts', () => {
    expect(
      parseSummerProgress({ kind: 'tool', name: 'spend', phase: 'start' })
    ).toEqual({
      kind: 'tool',
      name: 'spend',
      phase: 'start',
      ms: null,
    });
    expect(
      parseSummerProgress({ kind: 'tool', name: 'spend', phase: 'bogus' })
    ).toBeNull();
    expect(parseSummerProgress({ kind: 'tool', phase: 'start' })).toBeNull();
    expect(parseSummerProgress({ kind: 'mystery' })).toBeNull();
    expect(parseSummerProgress('x')).toBeNull();
    expect(parseSummerProgress({ kind: 'plan', summary: 'Do X' })).toEqual({
      kind: 'plan',
      summary: 'Do X',
    });
  });
});

describe('summerProgressLines', () => {
  it('shows a running check, then the finished one with the endpoint ms', () => {
    const start: SummerProgressPart = {
      kind: 'tool',
      name: 'shipping_state',
      phase: 'start',
      ms: null,
    };
    expect(summerProgressLines([start])).toEqual([
      {
        key: 'tool:shipping_state',
        text: 'Checking shipping…',
        state: 'running',
      },
    ]);
    expect(
      summerProgressLines([start, { ...start, phase: 'done', ms: 420 }])
    ).toEqual([
      {
        key: 'tool:shipping_state',
        text: 'Checked shipping · 420 ms',
        state: 'done',
      },
    ]);
  });

  it('reports a failed tool honestly and never invents a duration', () => {
    const lines = summerProgressLines([
      { kind: 'tool', name: 'spend', phase: 'start', ms: null },
      { kind: 'tool', name: 'spend', phase: 'error', ms: null },
    ]);
    expect(lines).toEqual([
      { key: 'tool:spend', text: 'Couldn’t check spend', state: 'failed' },
    ]);
    expect(
      summerProgressLines([
        { kind: 'tool', name: 'spend', phase: 'start', ms: null },
        { kind: 'tool', name: 'spend', phase: 'done', ms: null },
      ])[0]?.text
    ).toBe('Checked spend');
  });

  it('adds planner status and plan steps, keeps the last three, and shows nothing for no events', () => {
    expect(summerProgressLines([])).toEqual([]);
    const lines = summerProgressLines([
      { kind: 'meta', model: 'm' },
      { kind: 'status', phase: 'planner', text: 'Handing to the planner' },
      { kind: 'tool', name: 'a', phase: 'start', ms: null },
      { kind: 'tool', name: 'b', phase: 'start', ms: null },
      { kind: 'plan', summary: 'x' },
    ]);
    expect(lines.map(l => l.text)).toEqual([
      'Checking a…',
      'Checking b…',
      'Plan ready',
    ]);
  });
});
