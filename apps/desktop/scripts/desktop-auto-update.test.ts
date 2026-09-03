import { expect, test } from 'vitest';
import {
  buildDesktopUpdateMenuItem,
  desktopBundlePathFromExecutable,
  hasNightlyUpdateFlag,
  NIGHTLY_UPDATE_FLAG,
  nightlyUpdateLaunchAgentLabel,
  nightlyUpdateMinute,
  renderNightlyUpdateLaunchAgentPlist,
  shouldInstallDownloadedUpdateNow,
  shouldScheduleDesktopAutoUpdate,
} from '../src/desktop-auto-update.ts';

test('local darwin builds do not enable Check for updates (JOV-5471)', () => {
  expect(
    shouldScheduleDesktopAutoUpdate({
      appEnv: 'local',
      platform: 'darwin',
    })
  ).toBe(false);

  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'local',
      platform: 'darwin',
      updateReadyToInstall: false,
    })
  ).toEqual({
    label: 'Check for updates…',
    enabled: false,
  });
});

test('production darwin keeps the manual update action enabled', () => {
  expect(
    shouldScheduleDesktopAutoUpdate({
      appEnv: 'production',
      platform: 'darwin',
    })
  ).toBe(true);

  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'production',
      platform: 'darwin',
      updateReadyToInstall: false,
    })
  ).toEqual({
    label: 'Check for updates…',
    enabled: true,
  });
});

test('staging darwin keeps the manual update action enabled', () => {
  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'staging',
      platform: 'darwin',
      updateReadyToInstall: false,
    })
  ).toEqual({
    label: 'Check for updates…',
    enabled: true,
  });
});

test('ready-to-install label stays disabled on the local channel', () => {
  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'local',
      platform: 'darwin',
      updateReadyToInstall: true,
    })
  ).toEqual({
    label: 'Restart to install update…',
    enabled: false,
  });
});

test('production darwin ready-to-install keeps Restart enabled', () => {
  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'production',
      platform: 'darwin',
      updateReadyToInstall: true,
    })
  ).toEqual({
    label: 'Restart to install update…',
    enabled: true,
  });
});

test('linux never schedules auto-update even on published channels', () => {
  expect(
    shouldScheduleDesktopAutoUpdate({
      appEnv: 'production',
      platform: 'linux',
    })
  ).toBe(false);
  expect(
    buildDesktopUpdateMenuItem({
      appEnv: 'production',
      platform: 'linux',
      updateReadyToInstall: false,
    }).enabled
  ).toBe(false);
});

test('nightly launch agents are registered for prod and staging only', () => {
  expect(nightlyUpdateLaunchAgentLabel('production')).toBe(
    'app.jov.ie.nightly-update'
  );
  expect(nightlyUpdateLaunchAgentLabel('staging')).toBe(
    'app.jov.ie.staging.nightly-update'
  );
  expect(nightlyUpdateLaunchAgentLabel('local')).toBeNull();
  expect(nightlyUpdateMinute('production')).toBe(17);
  expect(nightlyUpdateMinute('staging')).toBe(41);
  expect(nightlyUpdateMinute('local')).toBeNull();
});

test('closed nightly launches install immediately; visible windows wait', () => {
  expect(
    shouldInstallDownloadedUpdateNow({
      nightlyLaunch: true,
      hasVisibleWindow: false,
    })
  ).toBe(true);
  expect(
    shouldInstallDownloadedUpdateNow({
      nightlyLaunch: true,
      hasVisibleWindow: true,
    })
  ).toBe(false);
  expect(
    shouldInstallDownloadedUpdateNow({
      nightlyLaunch: false,
      hasVisibleWindow: false,
    })
  ).toBe(false);
});

test('nightly LaunchAgent plist opens the packaged app hidden with the in-tree flag', () => {
  expect(hasNightlyUpdateFlag(['--jovie-nightly-update'])).toBe(true);
  expect(hasNightlyUpdateFlag([])).toBe(false);

  const plist = renderNightlyUpdateLaunchAgentPlist({
    label: 'app.jov.ie.nightly-update',
    bundlePath: '/Applications/Jovie.app',
    hour: 3,
    minute: 17,
  });
  expect(plist).toContain('/usr/bin/open');
  expect(plist).toContain('<string>-g</string>');
  expect(plist).toContain(`<string>${NIGHTLY_UPDATE_FLAG}</string>`);
  expect(plist).toContain('<string>/Applications/Jovie.app</string>');
  expect(
    desktopBundlePathFromExecutable(
      '/Applications/Jovie.app/Contents/MacOS/Jovie'
    )
  ).toBe('/Applications/Jovie.app');
});
