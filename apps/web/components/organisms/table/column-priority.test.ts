import { describe, expect, it } from 'vitest';
import {
  type ColumnPrioritySpec,
  resolveColumnPriorityLayout,
  stabilizeColumnPriorityLayout,
} from './column-priority';

const columns: readonly ColumnPrioritySpec[] = [
  { id: 'select', minWidth: 40 },
  { id: 'fan', minWidth: 220 },
  { id: 'action', minWidth: 120 },
  { id: 'state', priority: 2, minWidth: 200 },
  { id: 'last', priority: 2, minWidth: 140 },
  { id: 'alerts', priority: 1, minWidth: 120 },
  { id: 'engagement', priority: 1, minWidth: 120 },
];

describe('resolveColumnPriorityLayout', () => {
  it('hides both lower tiers below 720', () => {
    expect(resolveColumnPriorityLayout(columns, 719).visibility).toEqual({
      state: false,
      last: false,
      alerts: false,
      engagement: false,
    });
  });

  it('keeps state and last seen from 720 and hides alerts and engagement', () => {
    expect(resolveColumnPriorityLayout(columns, 720).visibility).toEqual({
      alerts: false,
      engagement: false,
    });
    expect(resolveColumnPriorityLayout(columns, 959).hiddenIds).toEqual([
      'alerts',
      'engagement',
    ]);
  });

  it('shows every column at 960 and above', () => {
    expect(resolveColumnPriorityLayout(columns, 960).visibility).toEqual({});
    expect(resolveColumnPriorityLayout(columns, 1280).hiddenIds).toEqual([]);
  });

  it('reports the visible fit budget', () => {
    expect(resolveColumnPriorityLayout(columns, 700).visibleMinWidth).toBe(380);
    expect(resolveColumnPriorityLayout(columns, 800).visibleMinWidth).toBe(720);
    expect(resolveColumnPriorityLayout(columns, 1000).visibleMinWidth).toBe(
      960
    );
  });
});

describe('stabilizeColumnPriorityLayout', () => {
  it('does not flap when the width oscillates across a boundary', () => {
    const wide = resolveColumnPriorityLayout(columns, 1000);
    const stillWide = stabilizeColumnPriorityLayout(columns, 958, wide);
    expect(stillWide.hiddenIds).toEqual([]);

    const settled = stabilizeColumnPriorityLayout(columns, 962, stillWide);
    expect(settled.hiddenIds).toEqual([]);
  });

  it('accepts a tier change once the width clears the hysteresis band', () => {
    const wide = resolveColumnPriorityLayout(columns, 1200);
    const medium = stabilizeColumnPriorityLayout(columns, 900, wide);
    expect(medium.visibility).toEqual({
      alerts: false,
      engagement: false,
    });

    const narrow = stabilizeColumnPriorityLayout(columns, 700, medium);
    expect(narrow.visibility).toEqual({
      state: false,
      last: false,
      alerts: false,
      engagement: false,
    });
  });

  it('keeps the wide set until measurement arrives', () => {
    const layout = stabilizeColumnPriorityLayout(columns, 0, null);
    expect(layout.hiddenIds).toEqual([]);
  });
});
