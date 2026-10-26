import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lcp: 2500,
  cls: 0,
  status: 0,
  calls: [] as string[][],
}));

vi.mock('node:child_process', () => ({
  spawnSync: (_node: string, args: string[]) => {
    state.calls.push(args);
    const out = args.find(arg => arg.startsWith('--output-path='));
    if (out && state.status === 0) {
      writeFileSync(
        out.slice('--output-path='.length),
        JSON.stringify({
          audits: {
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

  it('names the failing route in a GitHub annotation on Actions', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const log = vi.mocked(console.log);
    state.lcp = 9000;
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'claim',
      '--runs',
      '1',
    ]);
    vi.unstubAllEnvs();
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(
      '::error title=Entry-route LCP gate%3A claim::claim (https://x.test/claim): LCP median 9000ms > 4000ms budget'
    );
  });

  it('emits no annotation when every route passes on Actions', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const log = vi.mocked(console.log);
    await main(['--base-url', 'https://x.test', '--route-id', 'start']);
    vi.unstubAllEnvs();
    expect(
      log.mock.calls.flat().some(l => String(l).startsWith('::error'))
    ).toBe(false);
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
