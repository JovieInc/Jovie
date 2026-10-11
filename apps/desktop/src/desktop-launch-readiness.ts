import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ResolvedDesktopBuildIdentity } from './build-identity';

export const DESKTOP_COMPOSER_READINESS_CHANNEL = 'desktop-composer-readiness';
export const DESKTOP_LAUNCH_READINESS_FILE = 'desktop-launch-readiness.json';
export interface ReadinessSender {
  readonly isMainWindow: boolean;
  readonly frame: {
    readonly isMainFrame: boolean;
    readonly detached: boolean;
    readonly url: string;
  } | null;
  readonly appOrigin: string;
  readonly visible: boolean;
  readonly minimized: boolean;
  readonly focused: boolean;
}

/** Unlike recovery IPC, measurement never falls back from a missing/stale frame. */
export function trustedReadinessSender(sender: ReadinessSender): boolean {
  if (
    !sender.isMainWindow ||
    !sender.frame?.isMainFrame ||
    sender.frame.detached
  )
    return false;
  try {
    const url = new URL(sender.frame.url);
    return (
      url.origin === sender.appOrigin &&
      ['/app/chat', '/app/ov/chat'].some(
        route => url.pathname === route || url.pathname.startsWith(`${route}/`)
      )
    );
  } catch {
    return false;
  }
}

export interface DesktopLaunchReadiness {
  readonly schema: 'jovie-desktop-launch-readiness/v1';
  readonly pid: number;
  readonly processTimeOrigin: string;
  readonly clock: 'main-process-performance-now';
  readonly nativeBuild: ResolvedDesktopBuildIdentity;
  readonly nativeWindowReadyToShowMs: number | null;
  readonly reactMountedMs: number | null;
  readonly composerVisibleEditableAfterPaintOpportunityMs: number | null;
  readonly composerActuallyFocusedMs: number | null;
}

type Milestone =
  | 'nativeWindowReadyToShowMs'
  | 'reactMountedMs'
  | 'composerVisibleEditableAfterPaintOpportunityMs'
  | 'composerActuallyFocusedMs';

/** One receipt per process launch; later reloads/focus events never reset its clock. */
export function createDesktopLaunchReadiness(input: {
  readonly pid: number;
  readonly processTimeOrigin: string;
  readonly nativeBuild: ResolvedDesktopBuildIdentity;
  readonly now: () => number;
  readonly onChange: (receipt: DesktopLaunchReadiness) => void;
}) {
  let receipt: DesktopLaunchReadiness = {
    schema: 'jovie-desktop-launch-readiness/v1',
    pid: input.pid,
    processTimeOrigin: input.processTimeOrigin,
    clock: 'main-process-performance-now',
    nativeBuild: input.nativeBuild,
    nativeWindowReadyToShowMs: null,
    reactMountedMs: null,
    composerVisibleEditableAfterPaintOpportunityMs: null,
    composerActuallyFocusedMs: null,
  };
  const mark = (milestone: Milestone): boolean => {
    const now = input.now();
    if (receipt[milestone] !== null || !Number.isFinite(now) || now < 0)
      return false;
    receipt = { ...receipt, [milestone]: now };
    input.onChange(receipt);
    return true;
  };
  input.onChange(receipt);
  return {
    snapshot: () => receipt,
    nativeWindowReadyToShow: () => mark('nativeWindowReadyToShowMs'),
    reactMounted: (sender: ReadinessSender) =>
      trustedReadinessSender(sender) && mark('reactMountedMs'),
    composerReady: (sender: ReadinessSender, args: readonly unknown[]) => {
      if (
        !trustedReadinessSender(sender) ||
        !sender.visible ||
        sender.minimized ||
        args.length !== 1
      )
        return false;
      const phase = args[0];
      if (phase === 'visible-editable')
        return (
          receipt.composerVisibleEditableAfterPaintOpportunityMs !== null ||
          mark('composerVisibleEditableAfterPaintOpportunityMs')
        );
      if (
        phase === 'focused' &&
        sender.focused &&
        receipt.composerVisibleEditableAfterPaintOpportunityMs !== null
      )
        return (
          receipt.composerActuallyFocusedMs !== null ||
          mark('composerActuallyFocusedMs')
        );
      return false;
    },
  };
}

/** Serialized atomic replacement keeps the latest launch bounded to one JSON file. */
export function createLaunchReadinessWriter(
  file: string,
  onError: (error: unknown) => void
) {
  let pending = Promise.resolve();
  return (receipt: DesktopLaunchReadiness): Promise<void> => {
    pending = pending
      .then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          `${file}.tmp`,
          `${JSON.stringify(receipt, null, 2)}\n`,
          { mode: 0o600 }
        );
        await rename(`${file}.tmp`, file);
      })
      .catch(onError);
    return pending;
  };
}
