import { describe, expect, it } from 'vitest';
import {
  buildGithubHeadroomTile,
  HEADROOM_SCHEMA,
  type HeadroomReport,
  type HeadroomWindow,
  parseHeadroomReport,
} from './github-headroom';

const NOW = Date.parse('2026-10-25T06:30:00.000Z');
const HOUR = '2026-10-25T06:00:00.000Z';
const win = (over: Partial<HeadroomWindow> = {}): HeadroomWindow => ({
  bucket: 'core',
  windowStart: HOUR,
  limit: 5000,
  samples: 40,
  minRemaining: 3100,
  medianRemaining: 4200,
  exhaustedSamples: 0,
  emptyShare: 0,
  ...over,
});
const report = (windows: HeadroomWindow[]): HeadroomReport => ({
  schema: HEADROOM_SCHEMA,
  generatedAt: '2026-10-25T06:30:00.000Z',
  windows,
});

describe('buildGithubHeadroomTile', () => {
  it('shows the current hour min against the 5000 limit, green when healthy', () => {
    expect(buildGithubHeadroomTile(report([win()]), NOW)).toEqual({
      value: '3,100 / 5,000',
      line: 'core bucket · median 4,200 · never empty this hour',
      tone: 'good',
      measured: true,
    });
  });
  it('is red when any sample was empty, even if the min looks fine elsewhere', () => {
    const tile = buildGithubHeadroomTile(
      report([
        win({ bucket: 'core', minRemaining: 4000 }),
        win({ bucket: 'graphql', minRemaining: 900, emptyShare: 0.025 }),
      ]),
      NOW
    );
    expect(tile.tone).toBe('bad');
    expect(tile.value).toBe('900 / 5,000');
    expect(tile.line).toContain('graphql bucket');
    expect(tile.line).toContain('empty in 2.5% of samples');
  });
  it('is amber below the 20 percent back-off line', () => {
    expect(
      buildGithubHeadroomTile(report([win({ minRemaining: 900 })]), NOW).tone
    ).toBe('warn');
  });
  it('picks the tightest bucket by fraction of its own limit', () => {
    const tile = buildGithubHeadroomTile(
      report([
        win({ bucket: 'core', minRemaining: 2500 }),
        win({ bucket: 'graphql', minRemaining: 4000, limit: 5000 }),
      ]),
      NOW
    );
    expect(tile.line.startsWith('core bucket')).toBe(true);
  });
  it('says Unknown, never green, with no report, no current-hour sample, or zero samples', () => {
    for (const input of [
      null,
      report([]),
      report([win({ windowStart: '2026-10-25T05:00:00.000Z' })]),
      report([win({ samples: 0 })]),
    ]) {
      const tile = buildGithubHeadroomTile(input, NOW);
      expect(tile).toMatchObject({
        value: 'Unknown',
        tone: 'neutral',
        measured: false,
      });
    }
  });
});

describe('parseHeadroomReport', () => {
  it('accepts the CLI schema and drops malformed windows', () => {
    const parsed = parseHeadroomReport({
      schema: HEADROOM_SCHEMA,
      generatedAt: 'x',
      windows: [
        win(),
        { bucket: 'core' },
        null,
        win({ minRemaining: Number.NaN }),
      ],
    });
    expect(parsed?.windows).toHaveLength(1);
  });
  it('rejects a wrong schema or shape', () => {
    expect(parseHeadroomReport(null)).toBeNull();
    expect(parseHeadroomReport({ schema: 'other/v1', windows: [] })).toBeNull();
    expect(
      parseHeadroomReport({ schema: HEADROOM_SCHEMA, windows: 'no' })
    ).toBeNull();
  });
});
