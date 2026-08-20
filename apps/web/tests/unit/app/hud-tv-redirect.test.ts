import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudTvRedirectPage from '@/app/hud-tv/page';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('/hud-tv compatibility alias', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects the TV URL to fullscreen Ops', async () => {
    await expect(
      HudTvRedirectPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`NEXT_REDIRECT:${APP_ROUTES.HUD}?fs=1`);
  });

  it('preserves the kiosk token on the canonical Ops route', async () => {
    await expect(
      HudTvRedirectPage({
        searchParams: Promise.resolve({ kiosk: 'tv-token' }),
      })
    ).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.HUD}?kiosk=${encodeURIComponent('tv-token')}`
    );
  });
});
