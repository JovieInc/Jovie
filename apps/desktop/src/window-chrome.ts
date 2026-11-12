// @coverage-via apps/desktop/scripts/desktop-shell-contract.test.mjs

import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';

// JOV-8940: locked 44pt title-row chrome. The native lights lead at 12px
// and their centers sit on the row's icon centerline — 15px in-band, plus
// the JOV-8974 top gutter that rides the band one shell gap down.
const MACOS_TRAFFIC_LIGHT_X = 12;
const MACOS_TRAFFIC_LIGHT_Y = 23;
export const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: MACOS_TRAFFIC_LIGHT_X,
  y: MACOS_TRAFFIC_LIGHT_Y,
} as const;

// JOV-8940: the renderer collapses its traffic-light reserve when macOS
// hides the native lights in full screen, so the shell must learn about it.
const FULL_SCREEN_STATE_CHANNEL = 'desktop-full-screen-changed';
const GET_FULL_SCREEN_STATE_CHANNEL = 'desktop-get-full-screen-state';

export function bindWindowFullScreenState(win: BrowserWindow): void {
  // JOV-8940: broadcast native full-screen transitions so the renderer can
  // collapse its traffic-light reserve while macOS hides the native lights.
  const sendFullScreenState = () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(FULL_SCREEN_STATE_CHANNEL, win.isFullScreen());
    }
  };
  win.on('enter-full-screen', sendFullScreenState);
  win.on('leave-full-screen', sendFullScreenState);
}

export function registerFullScreenStateIpc(
  isTrustedIpcSender: (event: IpcMainInvokeEvent) => boolean
): void {
  ipcMain.handle(GET_FULL_SCREEN_STATE_CHANNEL, (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    return Boolean(win && !win.isDestroyed() && win.isFullScreen());
  });
}
