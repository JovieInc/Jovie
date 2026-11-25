import { describe, expect, it } from 'vitest';
import type { OvieCompanyTile } from '@/lib/ovie/home/company-tiles';
import { countOUpdate, oUpdateLabel, oUpdateSpecs } from '@/lib/ovie/o-updates';
import type { HudShippingSnapshot } from './useHudShippingStateQuery';
import {
  homeGlanceUpdate,
  linearUpdate,
  shippedUpdate,
} from './useOUpdateOptIns';

const pr = (number: number) => ({
  repo: 'JovieInc/Jovie',
  number,
  title: `PR ${number}`,
  url: `https://github.com/JovieInc/Jovie/pull/${number}`,
  mergedAt: '2026-11-22T10:00:00Z',
});

const task = (id: string, workflowState: string) => ({ id, workflowState });

function snapshot(
  merged: readonly number[],
  tasks: readonly ReturnType<typeof task>[]
): HudShippingSnapshot {
  return {
    view: { delivery: { merges: { recent: merged.map(pr) } } },
    operationalTasks: { tasks },
  } as unknown as HudShippingSnapshot;
}

const tile = (key: string, value: string, measured = true): OvieCompanyTile =>
  ({ key, value, measured }) as unknown as OvieCompanyTile;

describe('O update opt-ins', () => {
  it('counts only PRs that merged since the last read', () => {
    const before = snapshot([1, 2], []);
    expect(countOUpdate(shippedUpdate, before, snapshot([1, 2], []))).toBe(0);
    expect(countOUpdate(shippedUpdate, before, snapshot([3, 2, 1], []))).toBe(
      1
    );
    expect(
      countOUpdate(shippedUpdate, before, snapshot([5, 4, 3, 2, 1], []))
    ).toBe(3);
    expect(oUpdateLabel(shippedUpdate, 3)).toBe('3 changes shipped');
    expect(oUpdateLabel(shippedUpdate, 1)).toBe('1 change shipped');
  });

  it('counts Linear tasks that arrived or changed state', () => {
    const before = snapshot([], [task('a', 'queued'), task('b', 'running')]);
    const same = snapshot([], [task('a', 'queued'), task('b', 'running')]);
    const moved = snapshot(
      [],
      [task('a', 'merged'), task('b', 'running'), task('c', 'queued')]
    );
    expect(countOUpdate(linearUpdate, before, same)).toBe(0);
    expect(countOUpdate(linearUpdate, before, moved)).toBe(2);
    expect(oUpdateLabel(linearUpdate, 2)).toBe('2 tasks moved');
  });

  it('counts Home glance numbers whose measured value changed', () => {
    const before = [tile('mrr', '$1k'), tile('users', '10')];
    expect(countOUpdate(homeGlanceUpdate, before, [...before])).toBe(0);
    expect(
      countOUpdate(homeGlanceUpdate, before, [
        tile('mrr', '$2k'),
        tile('users', '10'),
        tile('runway', '9 mo'),
      ])
    ).toBe(1);
    expect(
      countOUpdate(homeGlanceUpdate, before, [tile('mrr', '$1k', false)])
    ).toBe(0);
  });

  it('reads a single spec or a list from query meta', () => {
    expect(oUpdateSpecs({ oUpdate: homeGlanceUpdate })).toHaveLength(1);
    expect(
      oUpdateSpecs({ oUpdate: [shippedUpdate, linearUpdate] })
    ).toHaveLength(2);
    expect(oUpdateSpecs(undefined)).toEqual([]);
  });
});
