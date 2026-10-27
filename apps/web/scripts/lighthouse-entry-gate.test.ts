import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  it('projects post-trace geometry and same-node image discovery from actual LH13 detail builders', async () => {
    const require = createRequire(import.meta.url);
    const lhci = path.dirname(require.resolve('@lhci/cli/package.json'));
    const { Audit } = await import(
      pathToFileURL(
        require.resolve('lighthouse/core/audits/audit.js', { paths: [lhci] })
      ).href
    );
    const node = Audit.makeNodeItem({
      lhId: 'fixture-image',
      selector: '#synthetic-private',
      nodeLabel: 'synthetic-private',
      snippet: '<img src="https://fixture.test/private">',
      boundingRect: {
        top: 0,
        left: 0,
        right: 120,
        bottom: 120,
        width: 120,
        height: 120,
      },
    });
    const checklist = Audit.makeChecklistDetails({
      priorityHinted: { value: false, label: 'synthetic-private' },
      requestDiscoverable: { value: true, label: 'synthetic-private' },
      eagerlyLoaded: { value: true, label: 'synthetic-private' },
      unexpected: { value: true, label: 'synthetic-private' },
    });
    const report = {
      audits: {
        'lcp-breakdown-insight': { details: Audit.makeListDetails([node]) },
        'lcp-discovery-insight': {
          details: Audit.makeListDetails([checklist, node]),
        },
      },
    };
    const result = extractLcpDiagnostics(report);
    expect(result).toMatchObject({
      postTraceRectCssPx: { width: 120, height: 120 },
      imageDiscovery: {
        priorityHinted: false,
        requestDiscoverable: true,
        eagerlyLoaded: true,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|unexpected|lhId|selector|snippet|nodeLabel/
    );
    report.audits['lcp-discovery-insight'].details = Audit.makeListDetails([
      checklist,
      { ...node, lhId: 'different-node' },
    ]);
    expect(extractLcpDiagnostics(report)).not.toHaveProperty('imageDiscovery');
  });

  it('omits unknown geometry and malformed discovery while preserving valid zero dimensions', () => {
    for (const width of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = extractLcpDiagnostics({
        audits: {
          'lcp-breakdown-insight': {
            details: {
              items: [{ type: 'node', boundingRect: { width, height: 10 } }],
            },
          },
        },
      });
      expect(result).not.toHaveProperty('postTraceRectCssPx');
    }
    const node = {
      type: 'node',
      lhId: 'fixture',
      boundingRect: { width: 0, height: 0 },
    };
    const result = extractLcpDiagnostics({
      audits: {
        'lcp-breakdown-insight': { details: { items: [node] } },
        'lcp-discovery-insight': {
          details: {
            items: [
              node,
              {
                type: 'checklist',
                items: {
                  priorityHinted: { value: 'private' },
                  eagerlyLoaded: { value: null },
                },
              },
            ],
          },
        },
      },
    });
    expect(result).toHaveProperty('postTraceRectCssPx', {
      width: 0,
      height: 0,
    });
    expect(result).not.toHaveProperty('imageDiscovery');
  });
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
