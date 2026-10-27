import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeLcpElement,
  evaluateEntryRoute,
  extractLcpDiagnostics,
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

  it('identifies the direct node in the Lighthouse 13 insight without exposing its content', () => {
    // Shape produced by Lighthouse 13.4.1 LCPBreakdownInsight.makeSubpartsTable
    // and Audit.makeListDetails / makeNodeItem; labels are not stable keys.
    expect(
      describeLcpElement({
        details: {
          type: 'list',
          items: [
            {
              type: 'table',
              items: [
                { subpart: 'timeToFirstByte', duration: 120 },
                { subpart: 'resourceLoadDelay', duration: 30 },
                { subpart: 'resourceLoadDuration', duration: 200 },
                { subpart: 'elementRenderDelay', duration: 50 },
              ],
            },
            {
              type: 'node',
              snippet:
                '<img src="https://example.test/cover?token=private-value">',
              selector: '#private-user-id > img',
              nodeLabel: 'private-profile-name',
            },
          ],
        },
      })
    ).toBe('img');
  });

  it('keeps legacy attribution without logging page text or attributes', () => {
    expect(
      describeLcpElement({
        details: {
          items: [
            {
              items: [
                {
                  node: {
                    snippet: '<p class="text-xs">',
                    nodeLabel: 'Essential cookies keep Jovie working.',
                  },
                },
              ],
            },
          ],
        },
      })
    ).toBe('p');
    expect(describeLcpElement(undefined)).toBe('unknown element');
  });

  it('reads observed subparts by stable ids regardless of translated labels or list order', () => {
    const result = extractLcpDiagnostics({
      lighthouseVersion: '13.4.1',
      finalDisplayedUrl: 'https://jov.ie/tim?claim=1',
      finalUrl: 'https://wrong.example.test/legacy',
      audits: {
        'lcp-breakdown-insight': {
          details: {
            type: 'list',
            items: [
              { type: 'node', snippet: '<P data-private="hidden">' },
              {
                type: 'table',
                items: [
                  {
                    subpart: 'elementRenderDelay',
                    label: 'translated',
                    duration: 180,
                  },
                  { subpart: 'private-key', duration: 9999 },
                  {
                    subpart: 'timeToFirstByte',
                    label: 'translated',
                    duration: 0,
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(result).toEqual({
      lighthouseVersion: '13.4.1',
      finalOrigin: 'https://jov.ie',
      finalPath: '/tim',
      element: { tag: 'p' },
      observedLcpBreakdownMs: { timeToFirstByte: 0, elementRenderDelay: 180 },
      diagnosticSource: 'lcp-breakdown-insight',
    });
  });

  it('omits invalid phase durations instead of fabricating zero measurements', () => {
    const result = extractLcpDiagnostics({
      audits: {
        'lcp-breakdown-insight': {
          details: {
            items: [
              {
                type: 'table',
                items: [
                  { subpart: 'timeToFirstByte', duration: -1 },
                  { subpart: 'resourceLoadDelay', duration: Number.NaN },
                  {
                    subpart: 'resourceLoadDuration',
                    duration: Number.POSITIVE_INFINITY,
                  },
                  { subpart: 'elementRenderDelay', duration: '50' },
                ],
              },
            ],
          },
        },
      },
    });
    expect(result.observedLcpBreakdownMs).toEqual({});
    expect(result.element).toEqual({ tag: 'unknown' });
  });

  it('supports legacy reports without exposing their text, attributes or URL credentials', () => {
    const destination = new URL(
      'http://localhost:3000/claim?token=secret#secret'
    );
    destination.username = 'user';
    destination.password = 'password';
    const result = extractLcpDiagnostics({
      lighthouseVersion: '12.8.2',
      finalUrl: destination.href,
      audits: {
        'largest-contentful-paint-element': {
          details: {
            items: [
              {
                items: [
                  {
                    node: {
                      snippet: '<video poster="private">',
                      nodeLabel: 'private',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(result).toEqual({
      lighthouseVersion: '12.8.2',
      finalOrigin: 'http://localhost:3000',
      finalPath: '/claim',
      element: { tag: 'video' },
      observedLcpBreakdownMs: {},
      diagnosticSource: 'legacy',
    });
  });

  it.each([
    '<private-user-name>',
    '<constructor>',
    '<img-private>',
    'private text',
    null,
  ])('never emits unknown element content: %s', snippet => {
    expect(
      describeLcpElement({
        details: { items: [{ type: 'node', snippet }] },
      })
    ).toBe('unknown element');
  });

  it.each([
    undefined,
    null,
    [],
    {
      lighthouseVersion: '13.4.1 private',
      finalDisplayedUrl: 'data:text/html,private',
      finalUrl: 'not a URL',
      audits: { 'lcp-breakdown-insight': null },
    },
  ])(
    'keeps unavailable diagnostics explicit for malformed optional data',
    report => {
      expect(extractLcpDiagnostics(report)).toEqual({
        lighthouseVersion: null,
        finalOrigin: null,
        finalPath: null,
        element: { tag: 'unknown' },
        observedLcpBreakdownMs: {},
        diagnosticSource: 'unavailable',
      });
    }
  );
});
