import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import floor from './agent-ready-floor.json';
import {
  compareToFloor,
  flattenScan,
  runScan,
  SCAN_ENDPOINT,
} from './scan.mjs';

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

describe('scanner response boundary', () => {
  it('preserves valid metadata and makes one bounded request', async () => {
    const payload = { ...scan, scannedAt: '2026-11-02T10:00:00Z', level: 1 };
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(payload));
    await expect(runScan('https://jov.ie', fetchImpl)).resolves.toEqual(
      payload
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe(SCAN_ENDPOINT);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ url: 'https://jov.ie' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects HTTP failures and invalid JSON', async () => {
    await expect(
      runScan(
        'https://jov.ie',
        vi.fn().mockResolvedValue(new Response('', { status: 503 }))
      )
    ).rejects.toThrow('scan HTTP 503');
    await expect(
      runScan(
        'https://jov.ie',
        vi.fn().mockResolvedValue(new Response('not JSON'))
      )
    ).rejects.toThrow();
  });

  it.each([
    null,
    [],
    {},
    { checks: [] },
    { checks: { discovery: null } },
    { checks: { discovery: { robotsTxt: null } } },
  ])('rejects malformed scanner payload %j', async payload => {
    await expect(
      runScan(
        'https://jov.ie',
        vi.fn().mockResolvedValue(Response.json(payload))
      )
    ).rejects.toThrow('scan response');
  });

  it.each([
    [
      {
        checks: {
          discovery: Object.fromEntries(
            Object.keys(floor).map(name => [name, { status: 'pass' }])
          ),
        },
      },
      0,
    ],
    [{ checks: { discovery: { robotsTxt: { status: 'fail' } } } }, 1],
    [{ checks: { discovery: null } }, 2],
  ])(
    'CLI distinguishes a scan result from unavailable evidence',
    (payload, expectedExit) => {
      const cli = pathToFileURL(
        resolve(process.cwd(), '../../scripts/agent-ready-scan.mjs')
      ).href;
      const code = `globalThis.fetch = async () => Response.json(${JSON.stringify(payload)}); process.argv = ['node', 'agent-ready-scan', '--json']; await import(${JSON.stringify(cli)});`;
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', code],
        { encoding: 'utf8', timeout: 10000 }
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(expectedExit);
      if (expectedExit === 2) expect(result.stderr).toContain('unavailable');
      else
        expect(JSON.parse(result.stdout).checkedAt).toEqual(expect.any(String));
    }
  );
});
