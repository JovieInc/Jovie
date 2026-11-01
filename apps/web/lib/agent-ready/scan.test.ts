import { describe, expect, it } from 'vitest';
import floor from './agent-ready-floor.json';
import { compareToFloor, flattenScan } from './scan.mjs';

const scan = {
  checks: {
    discoverability: {
      robotsTxt: { status: 'pass' },
      dnsAid: { status: 'fail' },
    },
    discovery: { mcpServerCard: { status: 'pass' } },
  },
};

describe('agent-ready scan ratchet', () => {
  it('flattens grouped results', () => {
    expect(flattenScan(scan)).toEqual({
      robotsTxt: 'pass',
      dnsAid: 'fail',
      mcpServerCard: 'pass',
    });
  });

  it('flags a floor check that dropped, and a missing one', () => {
    const { regressions } = compareToFloor(
      { robotsTxt: 'fail' },
      { robotsTxt: 'pass', sitemap: 'pass' }
    );
    expect(regressions).toEqual([
      { check: 'robotsTxt', required: 'pass', actual: 'fail' },
      { check: 'sitemap', required: 'pass', actual: 'missing' },
    ]);
  });

  it('reports passing checks above the floor as improvements to ratchet', () => {
    const { regressions, improvements } = compareToFloor(flattenScan(scan), {
      robotsTxt: 'pass',
    });
    expect(regressions).toEqual([]);
    expect(improvements).toEqual(['mcpServerCard']);
  });

  it('floor only names known statuses', () => {
    for (const value of Object.values(floor))
      expect(['pass', 'neutral', 'fail']).toContain(value);
  });
});
