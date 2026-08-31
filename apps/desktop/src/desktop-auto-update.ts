export type DesktopAppEnv = 'production' | 'staging' | 'local';

export interface DesktopAutoUpdateSupportInput {
  readonly appEnv: DesktopAppEnv;
  readonly platform: NodeJS.Platform;
}

export interface DesktopUpdateMenuItem {
  readonly label: string;
  readonly enabled: boolean;
}

/**
 * Local shells never auto-update. Linux has no published electron-updater
 * channel. Production publishes to the updater feed; staging ships as CI
 * artifacts and its check is a no-op (`publish: null`). See
 * apps/desktop/SIGNING.md.
 */
export function shouldScheduleDesktopAutoUpdate(
  input: DesktopAutoUpdateSupportInput
): boolean {
  return input.appEnv !== 'local' && input.platform !== 'linux';
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
