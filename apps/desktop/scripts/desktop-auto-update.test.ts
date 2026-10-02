import { expect, test } from 'vitest';
import {
  buildDesktopUpdateMenuItem,
  buildManualUpdateCheckFeedback,
  desktopBundlePathFromExecutable,
  hasNightlyUpdateFlag,
  IDLE_UPDATE_INSTALL_SECONDS,
  NIGHTLY_UPDATE_FLAG,
  nightlyUpdateLaunchAgentLabel,
  nightlyUpdateMinute,
  reduceDesktopUpdateState,
  renderNightlyUpdateLaunchAgentPlist,
  shouldInstallDownloadedUpdateNow,
  shouldInstallDownloadedUpdateWhileRunning,
  shouldRunWakeUpdateCheck,
  shouldScheduleDesktopAutoUpdate,
  WAKE_UPDATE_CHECK_MIN_INTERVAL_MS,
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
      workStateSafe: false,
      nightlyLaunch: true,
      hasVisibleWindow: false,
    })
  ).toBe(false);
  expect(
    shouldInstallDownloadedUpdateNow({
      workStateSafe: true,
      nightlyLaunch: true,
      hasVisibleWindow: false,
    })
  ).toBe(true);
  expect(
    shouldInstallDownloadedUpdateNow({
      workStateSafe: true,
      nightlyLaunch: true,
      hasVisibleWindow: true,
    })
  ).toBe(false);
  expect(
    shouldInstallDownloadedUpdateNow({
      workStateSafe: true,
      nightlyLaunch: false,
      hasVisibleWindow: false,
    })
  ).toBe(false);
});

test('a manual check that finds nothing still yields a visible up-to-date message (JOV-6342)', () => {
  expect(buildManualUpdateCheckFeedback('not-available')).toEqual({
    type: 'info',
    title: "You're Up To Date",
    message: 'Jovie is on the latest version.',
  });
});

test('a manual check that errors yields a visible retry message (JOV-6342)', () => {
  const feedback = buildManualUpdateCheckFeedback('error');
  expect(feedback.type).toBe('error');
  expect(feedback.title.length).toBeGreaterThan(0);
  expect(feedback.message.length).toBeGreaterThan(0);
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

const idleOvernight = {
  updateReadyToInstall: true,
  localHour: 3,
  systemIdleSeconds: IDLE_UPDATE_INSTALL_SECONDS,
  audible: false,
  hasUnsentInput: false,
  workStateSafe: true,
};

test('a running app restarts into a downloaded update only overnight and idle', () => {
  expect(shouldInstallDownloadedUpdateWhileRunning(idleOvernight)).toBe(true);
  expect(
    shouldInstallDownloadedUpdateWhileRunning({
      ...idleOvernight,
      localHour: 1,
    })
  ).toBe(true);
  for (const localHour of [0, 6, 12, 23]) {
    expect(
      shouldInstallDownloadedUpdateWhileRunning({ ...idleOvernight, localHour })
    ).toBe(false);
  }
  expect(
    shouldInstallDownloadedUpdateWhileRunning({
      ...idleOvernight,
      systemIdleSeconds: IDLE_UPDATE_INSTALL_SECONDS - 1,
    })
  ).toBe(false);
});

test('an idle restart never interrupts audio, drafts, or a missing download', () => {
  for (const guard of [
    { audible: true },
    { hasUnsentInput: true },
    { workStateSafe: false },
    { updateReadyToInstall: false },
  ]) {
    expect(
      shouldInstallDownloadedUpdateWhileRunning({ ...idleOvernight, ...guard })
    ).toBe(false);
  }
});

test('wake and unlock re-check for updates at most once per window', () => {
  expect(shouldRunWakeUpdateCheck({ nowMs: 1_000, lastCheckMs: null })).toBe(
    true
  );
  expect(
    shouldRunWakeUpdateCheck({
      nowMs: WAKE_UPDATE_CHECK_MIN_INTERVAL_MS - 1,
      lastCheckMs: 0,
    })
  ).toBe(false);
  expect(
    shouldRunWakeUpdateCheck({
      nowMs: WAKE_UPDATE_CHECK_MIN_INTERVAL_MS,
      lastCheckMs: 0,
    })
  ).toBe(true);
});

// ---------------------------------------------------------------------------
// Renderer-facing update state machine (JOV-6683): each autoUpdater event maps
// to a fully-determined typed phase, including the retryable error payload.
// ---------------------------------------------------------------------------

const NOTES_URL = 'https://jov.ie/changelog';

test.each([
  [{ type: 'checking-for-update' }, { state: 'checking' }],
  [{ type: 'update-not-available' }, { state: 'not-available' }],
  [
    {
      type: 'update-available',
      version: '26.9.16',
      releaseDate: '2026-09-27T00:00:00.000Z',
    },
    {
      state: 'available',
      version: '26.9.16',
      releaseDate: '2026-09-27T00:00:00.000Z',
      notesUrl: NOTES_URL,
    },
  ],
  [
    {
      type: 'download-progress',
      percent: 42.4,
      transferredBytes: 1024,
      totalBytes: 4096,
      bytesPerSecond: 512,
    },
    {
      state: 'downloading',
      percent: 42.4,
      transferredBytes: 1024,
      totalBytes: 4096,
      bytesPerSecond: 512,
    },
  ],
  [
    { type: 'update-downloaded', version: '26.9.16' },
    { state: 'ready', version: '26.9.16' },
  ],
  [
    { type: 'error', message: 'net::ERR_CONNECTION_REFUSED' },
    { state: 'error', message: 'net::ERR_CONNECTION_REFUSED', retryable: true },
  ],
] as const)('mapper emits the typed phase for %#', (event, expected) => {
  expect(reduceDesktopUpdateState(event, NOTES_URL)).toEqual(expected);
});

test('error to retry to downloading sequence stays well-typed', () => {
  const states = [
    { type: 'error', message: 'offline' },
    { type: 'checking-for-update' },
    { type: 'update-available', version: '26.9.16' },
    {
      type: 'download-progress',
      percent: 10,
      transferredBytes: 1,
      totalBytes: 10,
      bytesPerSecond: 1,
    },
  ] as const;

  expect(
    states.map(event => reduceDesktopUpdateState(event, NOTES_URL))
  ).toEqual([
    { state: 'error', message: 'offline', retryable: true },
    { state: 'checking' },
    {
      state: 'available',
      version: '26.9.16',
      releaseDate: null,
      notesUrl: NOTES_URL,
    },
    {
      state: 'downloading',
      percent: 10,
      transferredBytes: 1,
      totalBytes: 10,
      bytesPerSecond: 1,
    },
  ]);
});
