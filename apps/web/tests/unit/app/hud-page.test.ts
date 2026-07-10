import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('/hud compatibility redirect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('redirects kiosk bookmarks to the thin TV wrapper', async () => {
    const { default: HudPage } = await import('@/app/hud/page');

    await expect(
      HudPage({
        searchParams: Promise.resolve({ kiosk: 'test-token' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT:/hud-tv?kiosk=test-token');
  });

  it('redirects the legacy admin path to canonical Ops', async () => {
    const { default: HudPage } = await import('@/app/hud/page');

    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/app/admin/ops');
  });
});
