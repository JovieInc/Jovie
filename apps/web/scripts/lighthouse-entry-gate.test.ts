import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateEntryRoute,
  median,
  parseBudgets,
  resolveRoutePath,
} from './lighthouse-entry-gate';

const budget = { id: 'start', path: '/start', lcpMs: 4000, cls: 0.05 };

describe('lighthouse entry gate', () => {
  it('takes the median of an odd and an even sample set', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 2])).toBe(3);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('fails the production 2026-10-25 /start reading (8.4s) against 4.0s', () => {
    const verdict = evaluateEntryRoute(budget, {
      id: 'start',
      url: 'https://jov.ie/start',
      lcpSamples: [8300, 8400, 8500],
      clsSamples: [0, 0, 0],
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toContain('8400ms > 4000ms');
  });

  it('passes a route inside both budgets', () => {
    const verdict = evaluateEntryRoute(budget, {
      id: 'start',
      url: 'u',
      lcpSamples: [2100, 2300, 2200],
      clsSamples: [0, 0.01, 0],
    });
    expect(verdict.pass).toBe(true);
  });

  it('fails closed when nothing was measured', () => {
    const verdict = evaluateEntryRoute(budget, {
      id: 'start',
      url: 'u',
      lcpSamples: [],
      clsSamples: [],
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toHaveLength(2);
  });

  it('substitutes the handle into the claim-link route', () => {
    expect(resolveRoutePath('/[handle]?claim=1', 'tim')).toBe('/tim?claim=1');
  });

  it('rejects malformed budgets', () => {
    expect(() => parseBudgets([])).toThrow();
    expect(() =>
      parseBudgets([{ id: 'x', path: 'no-slash', lcpMs: 1, cls: 0 }])
    ).toThrow();
  });

  it('checked-in budgets cover /start, /claim and the claim-link landing and never exceed 4s', () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(__dirname, '..', 'performance-entry-budgets.json'),
        'utf8'
      )
    );
    const budgets = parseBudgets(raw);
    expect(budgets.map(b => b.path).sort()).toEqual(
      ['/[handle]?claim=1', '/claim', '/start'].sort()
    );
    for (const b of budgets) expect(b.lcpMs).toBeLessThanOrEqual(4000);
  });
});
