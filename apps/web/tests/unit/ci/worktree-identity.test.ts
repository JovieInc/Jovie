// @vitest-environment node
import type { FullConfig } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  verifyWorktreeApp,
  worktreeMetadata,
} from '../../../scripts/playwright-worktree';

const cwd = process.cwd();
function fixture() {
  const metadata = worktreeMetadata('http://localhost:3100', true, cwd);
  const config = { metadata } as FullConfig;
  const { origin: _origin, ...expected } = metadata.worktree!;
  return { config, actual: { ...expected, boot: 'c'.repeat(32) } };
}
afterEach(() => vi.restoreAllMocks());
describe('Playwright checkout isolation before seeding', () => {
  it('records the real app boot after verifying the expected checkout, head and port', async () => {
    const { config, actual } = fixture();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ worktree: actual })));
    await verifyWorktreeApp(config, request);
    expect(config.metadata.worktree).toEqual({
      ...actual,
      origin: 'http://localhost:3100',
    });
    expect(request).toHaveBeenCalledWith(
      'http://localhost:3100/api/health/build-info',
      expect.objectContaining({
        redirect: 'error',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
  });
  it.each(['id', 'head', 'port', 'boot'])(
    'fails closed on missing or wrong %s',
    async field => {
      const { config, actual } = fixture();
      const wrong = { ...actual, [field]: 'wrong' };
      await expect(
        verifyWorktreeApp(
          config,
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(
              new Response(JSON.stringify({ worktree: wrong }))
            )
        )
      ).rejects.toThrow('identity mismatch');
      expect(config.metadata.worktree.boot).toBeUndefined();
    }
  );
  it.each([null, {}, { worktree: null }])(
    'rejects missing app identity %j',
    async body => {
      await expect(
        verifyWorktreeApp(
          fixture().config,
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(JSON.stringify(body)))
        )
      ).rejects.toThrow('identity mismatch');
    }
  );
  it('fails on HTTP, transport and JSON errors', async () => {
    await expect(
      verifyWorktreeApp(
        fixture().config,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 503 }))
      )
    ).rejects.toThrow('503');
    await expect(
      verifyWorktreeApp(
        fixture().config,
        vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'))
      )
    ).rejects.toThrow('timeout');
    await expect(
      verifyWorktreeApp(
        fixture().config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>'))
      )
    ).rejects.toThrow();
  });
  it('never probes external or unmanaged apps as local checkout proof', async () => {
    expect(worktreeMetadata('https://jov.ie', true, '/missing')).toEqual({});
    expect(
      worktreeMetadata('http://localhost:3100', false, '/missing')
    ).toEqual({});
    const request = vi.fn<typeof fetch>();
    await verifyWorktreeApp({ metadata: {} } as FullConfig, request);
    await expect(
      verifyWorktreeApp(
        { metadata: { worktree: { origin: 'https://jov.ie' } } } as FullConfig,
        request
      )
    ).rejects.toThrow('loopback');
    expect(request).not.toHaveBeenCalled();
  });
});
