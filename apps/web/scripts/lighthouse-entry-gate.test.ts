import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeLcpElement,
  evaluateEntryRoute,
  median,
  parseBudgets,
  resolveRoutePath,
  summarizeLighthouseDiagnostics,
} from './lighthouse-entry-gate';

const budget = { id: 'start', path: '/start', lcpMs: 4000, cls: 0.05 };

// Relevant fields from the retained Lighthouse 13.4.1 /tim?claim=1 report.
const modernBreakdown = {
  details: {
    type: 'list',
    items: [
      {
        type: 'table',
        items: [
          { subpart: 'timeToFirstByte', duration: 1049.33 },
          { subpart: 'resourceLoadDelay', duration: 814.156 },
          { subpart: 'resourceLoadDuration', duration: 149.522 },
          { subpart: 'elementRenderDelay', duration: 6854.021 },
        ],
      },
      {
        type: 'node',
        snippet: '<img alt="Never Say A Word artwork" loading="eager">',
        nodeLabel: 'Never Say A Word artwork',
        selector: 'section.profile-mode-card img',
      },
    ],
  },
};

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

  it('names the LCP element so a failing budget says what to fix', () => {
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
    ).toBe('Essential cookies keep Jovie working.');
    expect(describeLcpElement(undefined)).toBe('unknown element');
  });

  it('names the LCP node from the Lighthouse 13 breakdown insight', () => {
    expect(
      describeLcpElement({
        details: {
          items: [...modernBreakdown.details.items].reverse(),
        },
      })
    ).toBe('section.profile-mode-card img "Never Say A Word artwork"');
  });

  it('distinguishes observed LCP subparts from the simulated audit metrics', () => {
    expect(
      summarizeLighthouseDiagnostics({
        lighthouseVersion: '13.4.1',
        configSettings: { throttlingMethod: 'simulate' },
        runWarnings: ['Clearing the browser cache timed out.'],
        audits: {
          'lcp-breakdown-insight': modernBreakdown,
          'first-contentful-paint': { numericValue: 2251 },
          'total-blocking-time': { numericValue: 1535 },
          metrics: {
            details: {
              items: [
                {
                  observedFirstContentfulPaint: 8867.029,
                  observedLargestContentfulPaint: 8867.029,
                },
              ],
            },
          },
        },
      })
    ).toEqual({
      lighthouseVersion: '13.4.1',
      throttlingMethod: 'simulate',
      element: {
        selector: 'section.profile-mode-card img',
        label: 'Never Say A Word artwork',
      },
      metricsMs: {
        firstContentfulPaint: 2251,
        totalBlockingTime: 1535,
        observedFirstContentfulPaint: 8867,
        observedLargestContentfulPaint: 8867,
      },
      observedLcpBreakdownMs: {
        timeToFirstByte: 1049,
        resourceLoadDelay: 814,
        resourceLoadDuration: 150,
        elementRenderDelay: 6854,
      },
      warnings: ['Clearing the browser cache timed out.'],
    });
  });

  it('falls back to the legacy LCP audit when the modern insight has no node', () => {
    const legacy = {
      details: {
        items: [
          {
            items: [
              {
                node: {
                  snippet: '<h1>Start</h1>',
                  nodeLabel: 'Start',
                  selector: 'main h1',
                },
              },
            ],
          },
        ],
      },
    };
    const modern = { details: { items: [{ type: 'table', items: [] }] } };
    expect(describeLcpElement(modern, legacy)).toBe('main h1 "Start"');
    const result = summarizeLighthouseDiagnostics({
      audits: {
        'lcp-breakdown-insight': modern,
        'largest-contentful-paint-element': legacy,
      },
    });
    expect(result.element).toEqual({ selector: 'main h1', label: 'Start' });
    expect(Object.values(result.observedLcpBreakdownMs)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('tolerates missing and malformed optional diagnostics without inventing timings', () => {
    const empty = summarizeLighthouseDiagnostics(undefined);
    for (const input of [null, [], { audits: null }]) {
      expect(summarizeLighthouseDiagnostics(input)).toEqual(empty);
    }
    expect(
      summarizeLighthouseDiagnostics({
        lighthouseVersion: 13,
        configSettings: { throttlingMethod: {} },
        runWarnings: [null, 123, {}],
        audits: {
          'first-contentful-paint': { numericValue: Number.NaN },
          'total-blocking-time': { numericValue: -1 },
          metrics: { details: { items: 'invalid' } },
          'lcp-breakdown-insight': {
            details: {
              items: [
                null,
                { type: 'node', selector: {}, nodeLabel: 123 },
                { type: 'table', items: null },
                {
                  type: 'table',
                  items: [
                    null,
                    { subpart: 'timeToFirstByte', duration: '1000' },
                    {
                      subpart: 'resourceLoadDelay',
                      duration: Number.POSITIVE_INFINITY,
                    },
                    { subpart: 'resourceLoadDuration', duration: -1 },
                  ],
                },
              ],
            },
          },
          'largest-contentful-paint-element': { details: { items: null } },
        },
      })
    ).toEqual(empty);
    expect(
      describeLcpElement({ details: { items: [null, { items: 1 }] } })
    ).toBe('unknown element');
  });

  it('bounds text and warning count and excludes report configuration and headers', () => {
    const longText = `  ${'text\n\t'.repeat(1000)}  `;
    const result = summarizeLighthouseDiagnostics({
      lighthouseVersion: longText,
      configSettings: {
        throttlingMethod: longText,
        extraHeaders: { Authorization: 'never-log-this-header' },
      },
      runWarnings: [longText, longText, longText, 'fourth warning'],
      audits: {
        'lcp-breakdown-insight': {
          details: {
            items: [{ type: 'node', selector: longText, nodeLabel: longText }],
          },
        },
      },
    });
    expect(result.lighthouseVersion).toHaveLength(40);
    expect(result.throttlingMethod).toHaveLength(24);
    expect(result.element.selector).toHaveLength(160);
    expect(result.element.label).toHaveLength(80);
    expect(result.warnings).toHaveLength(3);
    for (const warning of result.warnings) {
      expect(warning).toHaveLength(160);
      expect(warning).not.toMatch(/[\n\t]/);
    }
    const json = JSON.stringify(result);
    expect(json.length).toBeLessThan(1500);
    expect(json).not.toContain('never-log-this-header');
    expect(json).not.toContain('extraHeaders');
    expect(json).not.toContain('fourth warning');
    expect(
      describeLcpElement({
        details: {
          items: [{ type: 'node', selector: longText, nodeLabel: longText }],
        },
      }).length
    ).toBe(133);
  });

  it.each(['modern', 'legacy'])(
    'redacts URLs from %s element attribution and warnings',
    format => {
      const url = new URL(
        'https://x.test/?token=SYNTHETIC_SECRET#FRAGMENT_SECRET'
      );
      url.username = 'USER_SECRET';
      url.password = 'PASS_SECRET';
      const node = {
        snippet: '<img src="/cover?token=SYNTHETIC_SECRET">',
        nodeLabel: 'Never Say A Word artwork',
        selector: `section.profile-mode-card img[src="${url}"]`,
      };
      const audit = {
        details: {
          items:
            format === 'modern'
              ? [{ type: 'node', ...node }]
              : [{ items: [{ node }] }],
        },
      };
      const result = summarizeLighthouseDiagnostics({
        audits: {
          [format === 'modern'
            ? 'lcp-breakdown-insight'
            : 'largest-contentful-paint-element']: audit,
        },
        runWarnings: [
          `Failed ${url} //x.test/?token=SYNTHETIC_SECRET /cover?token=SYNTHETIC_SECRET ./cover#FRAGMENT_SECRET`,
        ],
      });
      const element = describeLcpElement(audit);
      expect(element).toContain('Never Say A Word artwork');
      expect(element).toContain('section.profile-mode-card img');
      expect(element).not.toContain('<img');
      expect(result.warnings).toEqual(['Failed [URL] [URL] [URL] [URL]']);
      const output = JSON.stringify({ element, result });
      for (const secret of [
        'USER_SECRET',
        'PASS_SECRET',
        'SYNTHETIC_SECRET',
        'FRAGMENT_SECRET',
      ]) {
        expect(output).not.toContain(secret);
      }
      expect(
        describeLcpElement({
          details: { items: [{ type: 'node', snippet: node.snippet }] },
        })
      ).toBe('unknown element');
    }
  );
});
