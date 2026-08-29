export const NIGHTLY_UPDATE_FLAG = '--jovie-nightly-update';
export const NIGHTLY_UPDATE_TIMEOUT_MS = 15 * 60 * 1000;
export const NIGHTLY_UPDATE_HOUR = 3;
export const PRODUCTION_NIGHTLY_UPDATE_MINUTE = 17;
export const STAGING_NIGHTLY_UPDATE_MINUTE = 41;

export type DesktopAppEnv = 'production' | 'staging' | 'local';
export function hasNightlyUpdateFlag(argv: readonly string[]): boolean {
  return argv.includes(NIGHTLY_UPDATE_FLAG);
}
export function shouldScheduleDesktopAutoUpdate(input: {
  readonly appEnv: DesktopAppEnv;
  readonly platform: NodeJS.Platform;
}): boolean {
  if (input.appEnv === 'local' || input.platform === 'linux') {
    return false;
  }

  return input.platform === 'darwin' || input.platform === 'win32';
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
