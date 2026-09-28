export const NIGHTLY_UPDATE_FLAG = '--jovie-nightly-update';
export const NIGHTLY_UPDATE_TIMEOUT_MS = 15 * 60 * 1000;
export const NIGHTLY_UPDATE_HOUR = 3;
export const PRODUCTION_NIGHTLY_UPDATE_MINUTE = 17;
export const STAGING_NIGHTLY_UPDATE_MINUTE = 41;

export type DesktopAppEnv = 'production' | 'staging' | 'local';

export interface DesktopAutoUpdateSupportInput {
  readonly appEnv: DesktopAppEnv;
  readonly platform: NodeJS.Platform;
}

export interface DesktopUpdateMenuItem {
  readonly label: string;
  readonly enabled: boolean;
}

export function hasNightlyUpdateFlag(argv: readonly string[]): boolean {
  return argv.includes(NIGHTLY_UPDATE_FLAG);
}

/**
 * Local shells never auto-update. Linux has no published electron-updater
 * channel. Production and staging publish to GitHub updater feeds. See
 * apps/desktop/SIGNING.md.
 */
export function shouldScheduleDesktopAutoUpdate(
  input: DesktopAutoUpdateSupportInput
): boolean {
  if (input.appEnv === 'local' || input.platform === 'linux') {
    return false;
  }

  return input.platform === 'darwin' || input.platform === 'win32';
}

/**
 * An enabled menu command must yield visible pending or terminal feedback.
 * Unsupported channels disable the item instead of leaving a silent no-op.
 */
export function buildDesktopUpdateMenuItem(input: {
  readonly appEnv: DesktopAppEnv;
  readonly platform: NodeJS.Platform;
  readonly updateReadyToInstall: boolean;
}): DesktopUpdateMenuItem {
  return {
    label: input.updateReadyToInstall
      ? 'Restart to install update…'
      : 'Check for updates…',
    enabled: shouldScheduleDesktopAutoUpdate(input),
  };
}

export function nightlyUpdateLaunchAgentLabel(
  appEnv: DesktopAppEnv
): string | null {
  if (appEnv === 'production') return 'app.jov.ie.nightly-update';
  if (appEnv === 'staging') return 'app.jov.ie.staging.nightly-update';
  return null;
}

export function nightlyUpdateMinute(appEnv: DesktopAppEnv): number | null {
  if (appEnv === 'production') return PRODUCTION_NIGHTLY_UPDATE_MINUTE;
  if (appEnv === 'staging') return STAGING_NIGHTLY_UPDATE_MINUTE;
  return null;
}

export function shouldInstallDownloadedUpdateNow(input: {
  readonly nightlyLaunch: boolean;
  readonly hasVisibleWindow: boolean;
}): boolean {
  return input.nightlyLaunch && !input.hasVisibleWindow;
}

export type DesktopUpdateCheckOutcome = 'not-available' | 'error';

export interface DesktopUpdateCheckFeedback {
  readonly type: 'info' | 'error';
  readonly title: string;
  readonly message: string;
}

/**
 * A manually triggered "Check for updates…" click must always resolve to
 * visible feedback (JOV-6342) — silent background/nightly checks never call
 * this, so they stay silent.
 */
export function buildManualUpdateCheckFeedback(
  outcome: DesktopUpdateCheckOutcome
): DesktopUpdateCheckFeedback {
  return outcome === 'not-available'
    ? {
        type: 'info',
        title: "You're Up To Date",
        message: 'Jovie is on the latest version.',
      }
    : {
        type: 'error',
        title: 'Update Check Failed',
        message:
          'Jovie could not check for updates. Check your connection and try again.',
      };
}

export function desktopBundlePathFromExecutable(
  executablePath: string
): string {
  const macosDir = executablePath.replace(/\\/g, '/').split('/').slice(0, -1);
  const exeDir = macosDir.join('/');
  const contentsDir = exeDir.replace(/\/MacOS$/, '');
  const bundlePath = contentsDir.replace(/\/Contents$/, '');
  if (
    exeDir.endsWith('/MacOS') &&
    contentsDir.endsWith('/Contents') &&
    bundlePath.endsWith('.app')
  ) {
    return bundlePath;
  }

  return executablePath;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderNightlyUpdateLaunchAgentPlist(input: {
  readonly label: string;
  readonly bundlePath: string;
  readonly hour: number;
  readonly minute: number;
}): string {
  const label = escapeXml(input.label);
  const bundlePath = escapeXml(input.bundlePath);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-g</string>
        <string>-a</string>
        <string>${bundlePath}</string>
        <string>--args</string>
        <string>${NIGHTLY_UPDATE_FLAG}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${input.hour}</integer>
        <key>Minute</key>
        <integer>${input.minute}</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
</dict>
</plist>
`;
}

/** Keyboard/mouse idle time before a running app may restart into an update. */
export const IDLE_UPDATE_INSTALL_SECONDS = 20 * 60;
/** Local hours [start, end) in which an idle running app may restart. */
export const IDLE_UPDATE_INSTALL_WINDOW = { startHour: 1, endHour: 6 } as const;

/**
 * A long-running app otherwise installs only on quit, so it can sit on a
 * downloaded update for days. Overnight, it restarts into the update when the
 * Mac has been idle and nothing is playing or waiting to be sent. Voice capture
 * lives in the renderer and is invisible here, hence the long idle floor and
 * the overnight-only window. (The nightly LaunchAgent cannot signal a running
 * app: `open -a` drops --args for an already-running bundle.)
 */
export function shouldInstallDownloadedUpdateWhileRunning(input: {
  readonly updateReadyToInstall: boolean;
  readonly localHour: number;
  readonly systemIdleSeconds: number;
  readonly audible: boolean;
  readonly hasUnsentInput: boolean;
}): boolean {
  return (
    input.updateReadyToInstall &&
    input.localHour >= IDLE_UPDATE_INSTALL_WINDOW.startHour &&
    input.localHour < IDLE_UPDATE_INSTALL_WINDOW.endHour &&
    !input.audible &&
    !input.hasUnsentInput &&
    input.systemIdleSeconds >= IDLE_UPDATE_INSTALL_SECONDS
  );
}

/** Minimum gap between wake/unlock-triggered update checks. */
export const WAKE_UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRunWakeUpdateCheck(input: {
  readonly nowMs: number;
  readonly lastCheckMs: number | null;
}): boolean {
  return (
    input.lastCheckMs === null ||
    input.nowMs - input.lastCheckMs >= WAKE_UPDATE_CHECK_MIN_INTERVAL_MS
  );
}
