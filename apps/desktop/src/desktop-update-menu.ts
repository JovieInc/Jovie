export type DesktopUpdateEnvironment = 'production' | 'staging' | 'local';

export interface DesktopUpdateMenuItem {
  readonly label: string;
  readonly enabled: boolean;
  readonly click: () => void;
}

interface BuildDesktopUpdateMenuItemOptions {
  readonly updaterSupported: boolean;
  readonly updateReadyToInstall: boolean;
  readonly onClick: () => void;
}

export function shouldScheduleDesktopAutoUpdate(options: {
  readonly appEnv: DesktopUpdateEnvironment;
  readonly platform: NodeJS.Platform;
}): boolean {
  return options.appEnv !== 'local' && options.platform !== 'linux';
}

export function buildDesktopUpdateMenuItem(
  options: BuildDesktopUpdateMenuItemOptions
): DesktopUpdateMenuItem {
  return {
    label: options.updateReadyToInstall
      ? 'Restart to install update…'
      : 'Check for updates…',
    enabled: options.updaterSupported,
    click: options.onClick,
  };
}
