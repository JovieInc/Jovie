// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { type DailySeries, summarizeWindow, windowDates } from './contract';
import { DAILY_METRICS } from './daily-metrics';
import { MetricChart } from './metric-chart';
import { renderMetricChart } from './render.server';
import { CHART_TOKENS } from './shipping-chart';

const NOW = Date.parse('2026-11-08T20:40:00Z');
const series = (values: readonly number[]): DailySeries => {
  const dates = windowDates('2026-11-08', values.length);
  return Object.fromEntries(
    dates.map((date, i) => [
      date,
      {
        date,
        count: values[i]!,
        final: i < values.length - 2,
        observedAt: '2026-11-08T20:04:00.000Z',
      },
    ])
  );
};
const SPEND = Array.from({ length: 60 }, (_, i) => 1800 + ((i * 737) % 2400));
const SIGNUPS = Array.from({ length: 60 }, (_, i) => (i * 7) % 5);

const input = (
  metric: 'ai_spend' | 'signups',
  values: readonly number[],
  days: number
) => ({
  ...DAILY_METRICS[metric],
  summary: summarizeWindow(series(values), NOW, days),
  observedAt: '2026-11-08T20:04:00.000Z',
});

describe('MetricChart', () => {
  it('shows dollars for spend and colors a rise as bad', () => {
    const summary = summarizeWindow(series(SPEND), NOW, 7);
    const tree = JSON.stringify(
      MetricChart({ ...input('ai_spend', SPEND, 7), summary })
    );
    expect(tree).toContain('AI spend, last 7 days');
    expect(tree).toMatch(/\$\d/);
    const pct = summary.changePercent ?? 0;
    if (pct !== 0)
      expect(tree).toContain(
        pct > 0 ? CHART_TOKENS.error : CHART_TOKENS.success
      );
  });

  it('renders spend and signups PNGs', async () => {
    for (const [name, value] of [
      ['ai-spend-30d', input('ai_spend', SPEND, 30)],
      ['signups-7d', input('signups', SIGNUPS, 7)],
    ] as const) {
      const png = await renderMetricChart(value).then(r => r.arrayBuffer());
      expect(Buffer.from(png).subarray(1, 4).toString()).toBe('PNG');
      if (process.env.COMPANY_CHART_PREVIEW_DIR)
        writeFileSync(
          join(process.env.COMPANY_CHART_PREVIEW_DIR, `${name}.png`),
          Buffer.from(png)
        );
    }
  });
});
