import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  type BoundedProcessResult,
  DEFAULT_PROCESS_TIMEOUT_MS,
  type RunBoundedProcessInput,
  runBoundedProcess,
} from './bounded-process';
import {
  type DesktopAppEnv,
  desktopBundlePathFromExecutable,
  NIGHTLY_UPDATE_HOUR,
  nightlyUpdateLaunchAgentLabel,
  nightlyUpdateMinute,
  renderNightlyUpdateLaunchAgentPlist,
  shouldScheduleDesktopAutoUpdate,
} from './desktop-auto-update';

export const LAUNCHCTL_TIMEOUT_MS = DEFAULT_PROCESS_TIMEOUT_MS;

export type NightlyLaunchAgentIo = {
  mkdir(dirPath: string): Promise<void>;
  writeFile(filePath: string, data: string): Promise<void>;
};

export type NightlyLaunchAgentInstallInput = {
  readonly nightlyUpdateLaunch: boolean;
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly appEnv: DesktopAppEnv;
  readonly execPath: string;
  readonly homeDirectory: string;
  readonly uid?: number;
  readonly io?: NightlyLaunchAgentIo;
  readonly runProcess?: (
    input: RunBoundedProcessInput
  ) => Promise<BoundedProcessResult>;
};

export type NightlyLaunchAgentInstallResult =
  | { readonly ok: true; readonly skipped?: boolean }
  | { readonly ok: false; readonly reason: string };

const defaultIo: NightlyLaunchAgentIo = {
  mkdir: dirPath =>
    fs.mkdir(dirPath, { recursive: true }).then(() => undefined),
  writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8'),
};

function shouldInstall(input: NightlyLaunchAgentInstallInput): boolean {
  return (
    !input.nightlyUpdateLaunch &&
    input.packaged &&
    input.platform === 'darwin' &&
    shouldScheduleDesktopAutoUpdate({
      appEnv: input.appEnv,
      platform: input.platform,
    })
  );
}

async function runLaunchctl(
  args: readonly string[],
  runProcess: (input: RunBoundedProcessInput) => Promise<BoundedProcessResult>
): Promise<BoundedProcessResult> {
  return runProcess({
    command: 'launchctl',
    args,
    timeoutMs: LAUNCHCTL_TIMEOUT_MS,
    stdio: 'ignore',
    waitForExit: true,
  });
}

export async function installNightlyUpdateLaunchAgent(
  input: NightlyLaunchAgentInstallInput
): Promise<NightlyLaunchAgentInstallResult> {
  if (!shouldInstall(input)) {
    return { ok: true, skipped: true };
  }

  const label = nightlyUpdateLaunchAgentLabel(input.appEnv);
  const minute = nightlyUpdateMinute(input.appEnv);
  if (!label || minute === null) {
    return { ok: true, skipped: true };
  }

  const io = input.io ?? defaultIo;
  const runProcess = input.runProcess ?? runBoundedProcess;
  const plistPath = path.join(
    input.homeDirectory,
    'Library',
    'LaunchAgents',
    `${label}.plist`
  );

  try {
    await io.mkdir(path.dirname(plistPath));
    await io.writeFile(
      plistPath,
      renderNightlyUpdateLaunchAgentPlist({
        label,
        bundlePath: desktopBundlePathFromExecutable(input.execPath),
        hour: NIGHTLY_UPDATE_HOUR,
        minute,
      })
    );
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (typeof input.uid !== 'number') {
    return { ok: true };
  }

  const domain = `gui/${input.uid}`;
  try {
    await runLaunchctl(['bootout', `${domain}/${label}`], runProcess);
    await runLaunchctl(['bootstrap', domain, plistPath], runProcess);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
