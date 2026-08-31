import { expect, test } from 'vitest';
import {
  buildDesktopUpdateMenuItem,
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
