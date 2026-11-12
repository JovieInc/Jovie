// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  type DailySeries,
  MERGED_PR_SCOPES,
  type MergedPrScope,
  summarizeWindow,
  windowDates,
} from './contract';
import { renderShippingChart } from './render.server';
import { CHART_TOKENS, chartClock, ShippingChart } from './shipping-chart';

const NOW = Date.parse('2026-11-08T20:40:00Z');
const ORG = [
  61, 88, 74, 102, 95, 69, 43, 52, 91, 118, 96, 87, 58, 39, 72, 104, 126, 99,
  84, 47, 41, 63, 112, 131, 140, 79, 56, 49, 66, 97,
];

function series(values: readonly number[], share = 1): DailySeries {
  const dates = windowDates('2026-11-08', values.length);
  return Object.fromEntries(
    dates.map((date, i) => [
      date,
      {
        date,
        count: Math.round(values[i]! * share),
        final: i < values.length - 2,
        observedAt: '2026-11-08T20:04:00.000Z',
      },
    ])
  );
}

const padded = [...ORG, ...ORG, ...ORG].slice(-60);
const stored: Record<MergedPrScope, DailySeries> = {
  org: series(padded),
  Jovie: series(padded, 0.78),
  LogYourBody: series(padded, 0.12),
  'summer-config': series(padded, 0.1),
};

const windowsFor = (days: number) =>
  Object.fromEntries(
    MERGED_PR_SCOPES.map(scope => [
      scope,
      summarizeWindow(stored[scope], NOW, days),
    ])
  ) as Record<MergedPrScope, ReturnType<typeof summarizeWindow>>;

describe('chart tokens', () => {
  it('match design.tokens.json exactly', () => {
    const tokens = JSON.parse(
      readFileSync(
        join(process.cwd(), '..', '..', 'design.tokens.json'),
        'utf8'
      )
    ).color;
    const v = (group: string, key: string) =>
      String(tokens[`${group}.${key}`].$value).toLowerCase();
    expect(CHART_TOKENS).toEqual({
      canvas: v('surface', 'canvas'),
      card: v('surface', 'card'),
      elevated: v('surface', 'elevated'),
      borderSubtle: v('border', 'subtle'),
      borderDefault: v('border', 'default'),
      primary: v('text', 'primary'),
      secondary: v('text', 'secondary'),
      quaternary: v('text', 'quaternary'),
      ion: v('accent', 'ion'),
      selected: v('accent', 'selected'),
      success: v('status', 'success'),
      error: v('status', 'error'),
    });
  });
});

describe('ShippingChart', () => {
  it('formats the cache observation time in Pacific', () => {
    expect(chartClock('2026-11-08T20:04:00.000Z')).toBe('12:04 PM');
    expect(chartClock(null)).toBeNull();
  });

  it('renders the same PNG bytes for the same numbers', async () => {
    const input = {
      windows: windowsFor(7),
      observedAt: '2026-11-08T20:04:00.000Z',
    };
    const [a, b] = await Promise.all([
      renderShippingChart(input).then(r => r.arrayBuffer()),
      renderShippingChart(input).then(r => r.arrayBuffer()),
    ]);
    const hash = (buf: ArrayBuffer) =>
      createHash('sha256').update(Buffer.from(buf)).digest('hex');
    expect(Buffer.from(a).subarray(1, 4).toString()).toBe('PNG');
    expect(hash(a)).toBe(hash(b));
    if (process.env.COMPANY_CHART_PREVIEW_DIR) {
      writeFileSync(
        join(process.env.COMPANY_CHART_PREVIEW_DIR, 'shipping-7d.png'),
        Buffer.from(a)
      );
    }
  });

  it('renders 30 days and a window that is still backfilling', async () => {
    const thirty = await renderShippingChart({
      windows: windowsFor(30),
      observedAt: '2026-11-08T20:04:00.000Z',
    }).then(r => r.arrayBuffer());
    expect(thirty.byteLength).toBeGreaterThan(10_000);
    const partialStore = { ...stored, org: series(ORG.slice(-5)) };
    const partial = Object.fromEntries(
      MERGED_PR_SCOPES.map(scope => [
        scope,
        summarizeWindow(partialStore[scope], NOW, 7),
      ])
    ) as Record<MergedPrScope, ReturnType<typeof summarizeWindow>>;
    const tree = ShippingChart({ windows: partial, observedAt: null });
    expect(JSON.stringify(tree)).toContain('Some days are still loading');
    if (process.env.COMPANY_CHART_PREVIEW_DIR) {
      writeFileSync(
        join(process.env.COMPANY_CHART_PREVIEW_DIR, 'shipping-30d.png'),
        Buffer.from(thirty)
      );
    }
  });
});
