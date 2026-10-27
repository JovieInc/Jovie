import { existsSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lcp: 2500,
  cls: 0,
  status: 0,
  report: null as Record<string, unknown> | null,
  calls: [] as string[][],
}));

vi.mock('node:child_process', () => ({
  spawnSync: (_node: string, args: string[]) => {
    state.calls.push(args);
    const out = args.find(arg => arg.startsWith('--output-path='));
    if (out && state.status === 0) {
      writeFileSync(
        out.slice('--output-path='.length),
        JSON.stringify(
          state.report ?? {
            audits: {
              'largest-contentful-paint': { numericValue: state.lcp },
              'cumulative-layout-shift': { numericValue: state.cls },
            },
          }
        )
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
    state.report = null;
    state.calls = [];
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

  it('fails (exit 1) when LCP exceeds the budget', async () => {
    state.lcp = 9000;
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '1',
    ]);
    expect(code).toBe(1);
  });

  it('retains safe LH13 failure diagnostics without changing the sampled verdict or leaking report secrets', async () => {
    process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'bypass-private-value';
    const destination = new URL(
      'https://preview.example.test/signin?token=query-private-value#fragment-private-value'
    );
    destination.username = 'private-user';
    destination.password = 'private-password';
    state.report = {
      lighthouseVersion: '13.4.1',
      finalDisplayedUrl: destination.href,
      configSettings: {
        extraHeaders: { authorization: 'header-private-value' },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 6317 },
        'cumulative-layout-shift': { numericValue: 0 },
        'lcp-breakdown-insight': {
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
                  '<img src="https://example.test/image?token=node-private-value">',
                selector: '#private-user-id > img',
                nodeLabel: 'private-profile-name',
              },
            ],
          },
        },
      },
    };
    const code = await main([
      '--base-url',
      'https://preview.example.test',
      '--route-id',
      'claim-link',
      '--runs',
      '3',
    ]);
    expect(code).toBe(1);
    expect(state.calls).toHaveLength(3);
    expect(
      state.calls.every(
        args => args[1] === 'https://preview.example.test/tim?claim=1'
      )
    ).toBe(true);
    const logs = vi.mocked(console.log).mock.calls.map(args => args.join(' '));
    const diagnosticLines = logs.filter(line =>
      line.startsWith('  claim-link diagnostics ')
    );
    expect(diagnosticLines).toHaveLength(3);
    expect(
      JSON.parse(diagnosticLines[0].slice('  claim-link diagnostics '.length))
    ).toEqual({
      lighthouseVersion: '13.4.1',
      finalOrigin: 'https://preview.example.test',
      finalPath: '/signin',
      element: { tag: 'img' },
      observedLcpBreakdownMs: {
        timeToFirstByte: 120,
        resourceLoadDelay: 30,
        resourceLoadDuration: 200,
        elementRenderDelay: 50,
      },
      diagnosticSource: 'lcp-breakdown-insight',
    });
    expect(logs.join('\n')).toContain(
      'FAIL claim-link: LCP 6317ms / 4000ms, CLS 0.000 / 0.05'
    );
    expect(logs.join('\n')).not.toMatch(/private|<img|authorization/);
    for (const args of state.calls) {
      for (const prefix of ['--output-path=', '--extra-headers=']) {
        const fileArg = args.find(arg => arg.startsWith(prefix));
        expect(fileArg).toBeDefined();
        expect(existsSync(fileArg!.slice(prefix.length))).toBe(false);
      }
    }
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
