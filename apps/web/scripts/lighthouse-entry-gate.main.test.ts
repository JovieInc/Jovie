import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lcp: 2500,
  cls: 0,
  status: 0,
  calls: [] as string[][],
  audits: {} as Record<string, unknown>,
  reportFields: {} as Record<string, unknown>,
}));

vi.mock('node:child_process', () => ({
  spawnSync: (_node: string, args: string[]) => {
    state.calls.push(args);
    const out = args.find(arg => arg.startsWith('--output-path='));
    if (out && state.status === 0) {
      writeFileSync(
        out.slice('--output-path='.length),
        JSON.stringify({
          ...state.reportFields,
          audits: {
            ...state.audits,
            'largest-contentful-paint': { numericValue: state.lcp },
            'cumulative-layout-shift': { numericValue: state.cls },
          },
        })
      );
    }
    return { status: state.status };
  },
}));

import { main } from './lighthouse-entry-gate';

describe('lighthouse entry gate main', () => {
  beforeEach(() => {
    state.lcp = 2500;
    state.cls = 0;
    state.status = 0;
    state.calls = [];
    state.audits = {};
    state.reportFields = {};
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    delete process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  });

  it('requires a base url', async () => {
    await expect(main([])).rejects.toThrow('--base-url is required');
  });

  it('rejects a route id that selects nothing', async () => {
    await expect(
      main(['--base-url', 'https://x.test', '--route-id', 'nope'])
    ).rejects.toThrow('no entry routes selected');
  });

  it('passes (exit 0) when every sampled route is inside budget', async () => {
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '3',
    ]);
    expect(code).toBe(0);
    expect(state.calls).toHaveLength(3);
    expect(state.calls[0].some(a => a.startsWith('--extra-headers'))).toBe(
      false
    );
  });

  it('retains modern LCP evidence while failing (exit 1) above the same budget', async () => {
    state.lcp = 9000;
    state.reportFields = {
      lighthouseVersion: '13.4.1',
      configSettings: {
        throttlingMethod: 'simulate',
        extraHeaders: { Authorization: 'private-report-header' },
      },
      runWarnings: ['Failed https://x.test/?token=SYNTHETIC_SECRET'],
    };
    state.audits = {
      'lcp-breakdown-insight': {
        details: {
          type: 'list',
          items: [
            {
              type: 'table',
              items: [{ subpart: 'elementRenderDelay', duration: 7000 }],
            },
            {
              type: 'node',
              snippet:
                '<h1 data-href="/start?token=SYNTHETIC_SECRET">Start</h1>',
              nodeLabel: 'Start',
              selector: 'main h1',
            },
          ],
        },
      },
    };
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '1',
    ]);
    expect(code).toBe(1);
    expect(state.calls).toHaveLength(1);
    expect(console.log).toHaveBeenCalledWith(
      '  start sample 1/1: LCP 9000ms CLS 0.000 element main h1 "Start"'
    );
    const diagnosticLine = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => String(line))
      .find(line => line.includes(' diagnostics '));
    if (!diagnosticLine) throw new Error('Missing sample diagnostics');
    const diagnostic = JSON.parse(diagnosticLine.split(' diagnostics ')[1]);
    expect(diagnostic).toMatchObject({
      lighthouseVersion: '13.4.1',
      throttlingMethod: 'simulate',
      element: { selector: 'main h1', label: 'Start' },
      observedLcpBreakdownMs: { elementRenderDelay: 7000 },
      warnings: ['Failed [URL]'],
    });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      'private-report-header'
    );
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      'SYNTHETIC_SECRET'
    );
    expect(console.log).toHaveBeenCalledWith(
      'FAIL start: LCP 9000ms / 4000ms, CLS 0.000 / 0.05'
    );
  });

  it('passes the Vercel bypass as a private headers file when configured', async () => {
    process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'secret-for-test';
    await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '1',
    ]);
    expect(state.calls[0].some(a => a.startsWith('--extra-headers='))).toBe(
      true
    );
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      'secret-for-test'
    );
  });

  it('surfaces a lighthouse process failure', async () => {
    state.status = 1;
    await expect(
      main([
        '--base-url',
        'https://x.test',
        '--route-id',
        'start',
        '--runs',
        '1',
      ])
    ).rejects.toThrow(/lighthouse failed/);
  });
});
