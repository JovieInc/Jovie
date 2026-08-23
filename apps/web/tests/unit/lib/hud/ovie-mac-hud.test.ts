import { describe, expect, it } from 'vitest';
import {
  computeDefaultAlive,
  computeWowGrowth,
  countReceiptedShipsThisWeek,
  gradeYcGrowth,
  monthlyToWeeklyUsd,
  parseReceiptedShip,
  windowToWeeklyUsd,
} from '@/lib/hud/ovie-mac-hud';

const RECEIPTED = {
  issueNumber: 5298,
  symphonyRef: 'symphony-task-1',
  mergeQueueRef: 'MQ-1',
  prodSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  receiptAt: '2026-08-20T12:00:00.000Z',
};

function aliveStatus(
  cashUsd: number,
  weeklyBurnUsd: number,
  weeklyRevenueUsd: number,
  weeklyRevenueGrowthRate: number | null = 0,
  available = true
) {
  return computeDefaultAlive({
    cashUsd,
    weeklyBurnUsd,
    weeklyRevenueUsd,
    weeklyRevenueGrowthRate,
    available,
  }).status;
}

describe('Ovie Mac HUD derivation', () => {
  it('decides default alive/dead from cash, burn, revenue, and growth', () => {
    expect(aliveStatus(10_000, 500, 0, 0.2)).toBe('dead');
    expect(aliveStatus(100, 50, 80)).toBe('alive');
    expect(aliveStatus(10_000, 200, 100, 0.2)).toBe('alive');
    expect(aliveStatus(100, 200, 50, 0.01)).toBe('dead');
    expect(aliveStatus(0, 0, 0, null, false)).toBe('unknown');
  });

  it('prefers revenue WoW, falls back to users, and never charts 0%', () => {
    const revenue = computeWowGrowth({
      thisWeekRevenueUsd: 110,
      lastWeekRevenueUsd: 100,
      thisWeekActiveUsers: 1,
      lastWeekActiveUsers: 1,
    });
    expect(revenue).toMatchObject({
      source: 'revenue',
      ycBar: 'exceptional',
      showChart: false,
    });
    expect(revenue.rate).toBeCloseTo(0.1);
    expect(gradeYcGrowth(0.06)).toBe('good');
    expect(gradeYcGrowth(0.01)).toBe('not-figured-out');
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 0,
        lastWeekRevenueUsd: 0,
        thisWeekActiveUsers: 0,
        lastWeekActiveUsers: 0,
      })
    ).toMatchObject({ source: 'active-users', rate: 0, showChart: false });
  });

  it('counts only receipted ships this week', () => {
    const now = Date.parse('2026-08-22T00:00:00.000Z');
    expect(
      parseReceiptedShip({ issueNumber: 1, mergedAt: RECEIPTED.receiptAt })
    ).toBeNull();
    const shipping = countReceiptedShipsThisWeek(
      [
        {
          title: 'Merged without receipt',
          mergedAt: '2026-08-21T00:00:00.000Z',
        },
        RECEIPTED,
        { ...RECEIPTED, receiptAt: '2026-08-01T00:00:00.000Z', issueNumber: 2 },
      ],
      now
    );
    expect(shipping.shipsThisWeek).toBe(1);
    expect(monthlyToWeeklyUsd(5200)).toBe(1200);
    expect(windowToWeeklyUsd(300, 30)).toBe(70);
  });
});
