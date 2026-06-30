import { app, Menu, nativeImage, Tray } from 'electron';

export type TrayState = 'idle' | 'active' | 'unread' | 'error';

const VALID_TRAY_STATES = new Set<string>([
  'idle',
  'active',
  'unread',
  'error',
]);

export function isValidTrayState(value: unknown): value is TrayState {
  return typeof value === 'string' && VALID_TRAY_STATES.has(value);
}

const TRAY_TOOLTIP: Record<TrayState, string> = {
  idle: 'Jovie',
  active: 'Jovie — Running',
  unread: 'Jovie — Unread messages',
  error: 'Jovie — Error',
};

// ponytail: dot badge only; numeric count requires a separate IPC payload shape
const DOCK_BADGE: Record<TrayState, string> = {
  idle: '',
  active: '',
  unread: '●',
  error: '!',
};

export interface MenuBarTray {
  readonly setState: (state: TrayState) => void;
  readonly destroy: () => void;
}

interface MenuBarTrayOptions {
  readonly appName: string;
  readonly iconPath: string;
  readonly onOpen: () => void;
}

export function createMenuBarTray(options: MenuBarTrayOptions): MenuBarTray {
  const { appName, iconPath, onOpen } = options;

  const baseIcon = nativeImage.createFromPath(iconPath);
  const trayIcon = baseIcon.isEmpty()
    ? nativeImage.createEmpty()
    : baseIcon.resize({ width: 16, height: 16 });

  const tray = new Tray(trayIcon);
  tray.setToolTip(appName);

  const menu = Menu.buildFromTemplate([
    { label: `Open ${appName}`, click: onOpen },
    { type: 'separator' },
    { label: `Quit ${appName}`, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);

  // Left-click opens the main window
  tray.on('click', onOpen);

  let currentState: TrayState = 'idle';

  function setState(state: TrayState): void {
    if (state === currentState) return;
    currentState = state;
    tray.setToolTip(TRAY_TOOLTIP[state]);
    if (app.dock) {
      app.dock.setBadge(DOCK_BADGE[state]);
    }
  }

  return { setState, destroy: () => tray.destroy() };
}
