// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type DailySeries, summarizeWindow, windowDates } from './contract';
import { Bars } from './shipping-chart';

describe('company chart bar geometry', () => {
  it.each([30, 90])(
    'marks a missing bucket next to a measured zero in a %i-day export',
    days => {
      const dates = windowDates('2026-11-08', days);
      const measuredDate = dates[10]!;
      const series = {
        [measuredDate]: {
          date: measuredDate,
          count: 0,
          final: true,
          observedAt: '2026-11-08T20:40:00Z',
        },
      };
      const summary = summarizeWindow(
        series,
        Date.parse('2026-11-08T20:40:00Z'),
        days
      );
      const { container } = render(<Bars summary={summary} />);
      const columns = container.firstElementChild!.children;
      expect(columns[9]?.childElementCount).toBe(2);
      expect(columns[10]?.childElementCount).toBe(1);
    }
  );
  it('reserves each day and distinguishes missing, measured zero and a small positive count', () => {
    const now = Date.parse('2026-11-08T20:40:00Z');
    const dates = windowDates('2026-11-08', 7);
    const counts = [1000, 1, null, 0, 75, 50, 0];
    const rows: Record<string, DailySeries[string]> = {};
    dates.forEach((date, i) => {
      const count = counts[i];
      if (count != null) {
        rows[date] = {
          date,
          count,
          final: true,
          observedAt: new Date(now).toISOString(),
        };
      }
    });
    const summary = summarizeWindow(rows, now, 7);
    const { container } = render(<Bars summary={summary} />);
    const columns = Array.from(container.firstElementChild!.children);
    expect(columns).toHaveLength(7);
    expect(
      columns.map(column => column.firstElementChild?.textContent)
    ).toEqual(['1,000', '1', '–', '0', '75', '50', '0']);
    for (const index of [2, 3, 6]) {
      expect(columns[index]?.childElementCount).toBe(1);
      expect(columns[index]?.firstElementChild).toBeVisible();
    }
    const barHeight = (index: number) =>
      Number.parseFloat(
        (columns[index]?.children[1] as HTMLElement).style.height
      );
    expect(barHeight(1) / barHeight(0)).toBeCloseTo(1 / 1000, 8);
  });
});
