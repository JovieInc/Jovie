import { describe, expect, it, vi } from 'vitest';
import {
  type OvieBrowserRecoveryRequest,
  openCurrentOvieInBrowser,
} from '../src/ovie-browser-recovery';

const currentUrl = 'https://jov.ie/app/ov/needs-you';
function request(
  update: Partial<OvieBrowserRecoveryRequest> = {}
): OvieBrowserRecoveryRequest {
  return {
    isMainWindow: true,
    isMainFrame: true,
    senderUrl: currentUrl,
    currentUrl,
    args: [],
    options: { appUrl: 'https://jov.ie', appEnv: 'production' },
    ...update,
  };
}
describe('current Ovie browser recovery native authority', () => {
  it.each([
    '/app/ov',
    '/app/ov/needs-you',
    '/app/admin',
    '/app/admin/users',
    '/hud',
    '/hud/wiki',
  ])('opens only approved current route %s', async route => {
    const url = `https://jov.ie${route}`;
    const open = vi.fn().mockResolvedValue(undefined);
    expect(
      await openCurrentOvieInBrowser(
        request({ currentUrl: url, senderUrl: url }),
        open
      )
    ).toEqual({ ok: true });
    expect(open).toHaveBeenCalledExactlyOnceWith(url);
  });
  it.each([
    { isMainWindow: false },
    { isMainFrame: false },
    { args: ['https://evil.example'] },
    { args: [null] },
    { senderUrl: 'https://evil.example/app/ov' },
    {
      currentUrl: 'https://evil.example/app/ov',
      senderUrl: 'https://evil.example/app/ov',
    },
    { senderUrl: 'https://jov.ie/app/ov/another-route' },
    { currentUrl: '' },
    { senderUrl: '' },
    { options: { appUrl: 'not-a-url', appEnv: 'production' as const } },
  ])(
    'denies foreign/stale frame or malformed request %j before OS open',
    async update => {
      const open = vi.fn();
      expect((await openCurrentOvieInBrowser(request(update), open)).ok).toBe(
        false
      );
      expect(open).not.toHaveBeenCalled();
    }
  );
  it.each([
    '/app/ovanything',
    '/app/adminish',
    '/huddy',
    '/app',
    '/signin',
    '/auth/start',
    '/timwhite',
    '/api/ovie/privacy-lock',
    '/app/ov/%5Cevil',
  ])('denies non-Ovie or unsafe route %s', async route => {
    const url = `https://jov.ie${route}`;
    const open = vi.fn();
    expect(
      await openCurrentOvieInBrowser(
        request({ currentUrl: url, senderUrl: url }),
        open
      )
    ).toEqual({ ok: false, reason: 'blocked-url' });
    expect(open).not.toHaveBeenCalled();
  });
  it('never transfers runtime, auth handoff, kiosk credentials, query or fragment', async () => {
    const url = `${currentUrl}?runtime=electron&desktop_return=secret&auth_return=secret&redirect_url=https://evil.example&desktop_flow=secret&code=secret&token=kiosk#secret`;
    const open = vi.fn().mockResolvedValue(undefined);
    expect(
      await openCurrentOvieInBrowser(
        request({ currentUrl: url, senderUrl: url }),
        open
      )
    ).toEqual({ ok: true });
    expect(open).toHaveBeenCalledExactlyOnceWith(currentUrl);
  });
  it('rejects embedded authority credentials', async () => {
    const parsed = new URL('https://jov.ie/app/ov');
    parsed.username = 'fixture-user';
    parsed.password = 'fixture-password';
    const url = parsed.href;
    const open = vi.fn();
    expect(
      (
        await openCurrentOvieInBrowser(
          request({ currentUrl: url, senderUrl: url }),
          open
        )
      ).ok
    ).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
  it('reports OS failure without pretending browser continuation succeeded', async () => {
    const open = vi.fn().mockRejectedValue(Error('No browser'));
    expect(await openCurrentOvieInBrowser(request(), open)).toEqual({
      ok: false,
      reason: 'open-external-failed',
    });
  });
  it('allows configured local HTTP development but rejects production HTTP', async () => {
    const url = 'http://localhost:3100/app/ov';
    const open = vi.fn().mockResolvedValue(undefined);
    const update = {
      currentUrl: url,
      senderUrl: url,
      options: { appUrl: 'http://localhost:3100', appEnv: 'local' as const },
    };
    expect((await openCurrentOvieInBrowser(request(update), open)).ok).toBe(
      true
    );
    open.mockClear();
    expect(
      (
        await openCurrentOvieInBrowser(
          request({
            ...update,
            options: { ...update.options, appEnv: 'production' },
          }),
          open
        )
      ).ok
    ).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
