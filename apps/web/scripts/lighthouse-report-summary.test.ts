import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  summarizeDirectory,
  summarizeReport,
} from './lighthouse-report-summary.mjs';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const releasesReport = {
  requestedUrl: 'http://localhost:3000/app/library?view=releases',
  finalDisplayedUrl: 'http://localhost:3000/app/library?view=releases',
  audits: {
    'first-contentful-paint': { numericValue: 1210.518 },
    'largest-contentful-paint': { numericValue: 2400.2 },
    'total-blocking-time': { numericValue: 310 },
    'cumulative-layout-shift': { numericValue: 0.074739 },
    'server-response-time': { numericValue: 412.4 },
    'network-requests': {
      details: {
        items: [
          { resourceType: 'Script', transferSize: 9000 },
          {
            resourceType: 'Document',
            transferSize: 61_440,
            resourceSize: 409_600,
          },
        ],
      },
    },
    'render-blocking-insight': {
      details: {
        items: [
          {
            url: 'http://localhost:3000/_next/static/css/small.css',
            totalBytes: 2048,
            wastedMs: 40,
          },
          {
            url: 'http://localhost:3000/_next/static/css/app.css',
            totalBytes: 40_960,
            wastedMs: 310,
          },
        ],
      },
    },
    'layout-shifts': {
      details: {
        items: [
          {
            score: 0.012,
            node: { selector: 'main > header' },
          },
          {
            score: 0.061,
            node: { selector: 'div.releases-table > div.row' },
            subItems: {
              items: [{ cause: 'Media element lacking an explicit size' }],
            },
          },
        ],
      },
    },
  },
};

describe('Lighthouse report summary', () => {
  it('names the metrics, the document size, and the worst causes first', () => {
    expect(summarizeReport(releasesReport)).toEqual([
      'Page /app/library?view=releases',
      '  FCP 1211 ms, LCP 2400 ms, TBT 310 ms, CLS 0.075, server response 412 ms',
      '  Document 60.0 KiB transferred, 400.0 KiB uncompressed',
      '  Render-blocking requests:',
      '    /_next/static/css/app.css 40.0 KiB 310 ms',
      '    /_next/static/css/small.css 2.0 KiB 40 ms',
      '  Layout shifts:',
      '    0.061 div.releases-table > div.row (Media element lacking an explicit size)',
      '    0.012 main > header',
    ]);
  });

  it('prints n/a for audits a report does not have', () => {
    expect(
      summarizeReport({ requestedUrl: 'http://localhost:3000/app', audits: {} })
    ).toEqual([
      'Page /app',
      '  FCP n/a, LCP n/a, TBT n/a, CLS n/a, server response n/a',
    ]);
  });

  it('summarizes only the median run of each page', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-lh-summary-'));
    directories.push(directory);
    const medianPath = join(directory, 'median.report.json');
    const otherPath = join(directory, 'other.report.json');
    writeFileSync(medianPath, JSON.stringify(releasesReport));
    writeFileSync(
      otherPath,
      JSON.stringify({
        requestedUrl: 'http://localhost:3000/ignored',
        audits: {},
      })
    );
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify([
        {
          url: 'http://localhost:3000/ignored',
          isRepresentativeRun: false,
          jsonPath: otherPath,
        },
        {
          url: releasesReport.requestedUrl,
          isRepresentativeRun: true,
          jsonPath: medianPath,
        },
      ])
    );

    const lines = summarizeDirectory(directory);
    expect(lines[0]).toBe(
      `Lighthouse summary for ${directory} (median run per page)`
    );
    expect(lines).toContain('Page /app/library?view=releases');
    expect(lines.join('\n')).not.toContain('/ignored');
  });

  it('says so when a directory has no manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-lh-summary-'));
    directories.push(directory);
    expect(summarizeDirectory(directory)).toEqual([
      `No Lighthouse manifest in ${directory}.`,
    ]);
  });
});
