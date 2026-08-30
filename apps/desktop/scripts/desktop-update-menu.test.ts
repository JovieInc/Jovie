import { describe, expect, test, vi } from 'vitest';
import {
  buildDesktopUpdateMenuItem,
  shouldScheduleDesktopAutoUpdate,
} from '../src/desktop-update-menu';

describe('desktop updater capability', () => {
  test.each([
    ['local', 'darwin'],
    ['local', 'win32'],
    ['production', 'linux'],
    ['staging', 'linux'],
  ] as const)('is unavailable for appEnv=%s on platform=%s', (appEnv, platform) => {
    expect(shouldScheduleDesktopAutoUpdate({ appEnv, platform })).toBe(false);
  });

  test.each([
    ['staging', 'darwin'],
    ['production', 'darwin'],
    ['production', 'win32'],
  ] as const)('is available for appEnv=%s on platform=%s', (appEnv, platform) => {
    expect(shouldScheduleDesktopAutoUpdate({ appEnv, platform })).toBe(true);
  });
});

describe('desktop update menu behavior', () => {
  test.each([
    [false, false],
    [true, true],
  ] as const)('maps updaterSupported=%s to enabled=%s', (updaterSupported, enabled) => {
    const onClick = vi.fn();
    const item = buildDesktopUpdateMenuItem({
      updaterSupported,
      updateReadyToInstall: false,
      onClick,
    });

    expect(item).toMatchObject({
      label: 'Check for updates…',
      enabled,
      click: onClick,
    });
  });

  test('keeps the enabled restart command bound to the supplied handler', () => {
    const onClick = vi.fn();
    const item = buildDesktopUpdateMenuItem({
      updaterSupported: true,
      updateReadyToInstall: true,
      onClick,
    });

    expect(item.label).toBe('Restart to install update…');
    expect(item.enabled).toBe(true);
    item.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
