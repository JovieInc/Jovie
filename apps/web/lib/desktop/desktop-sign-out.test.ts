import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktopShellDocument,
  resolveDesktopSignOutRedirect,
} from './desktop-sign-out';

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.desktopRuntime;
});

describe('desktop sign-out', () => {
  it('sends Mac app sign-out to sign-in instead of the homepage', () => {
    expect(resolveDesktopSignOutRedirect('/', true)).toBe('/signin');
    expect(resolveDesktopSignOutRedirect('/pricing', true)).toBe('/signin');
  });

  it('keeps the web sign-out target unchanged', () => {
    expect(resolveDesktopSignOutRedirect('/', false)).toBe('/');
  });

  it('detects the Mac app from its user agent or document marker', () => {
    expect(isDesktopShellDocument()).toBe(false);

    vi.stubGlobal('navigator', {
      userAgent: 'Electron/44 JovieDesktop/26.10.16',
    });
    expect(isDesktopShellDocument()).toBe(true);
    vi.unstubAllGlobals();

    document.documentElement.dataset.desktopRuntime = 'electron';
    expect(isDesktopShellDocument()).toBe(true);
  });
});
