// The Electron menu-bar tray is retired. The SwiftUI MenuMonitor in
// apps/macos owns the menu bar. These types remain for the renderer
// state bridge and for app-menu actions (for example New Message, Cmd+N).

export type TrayAppState = 'idle' | 'active' | 'unread' | 'error';

export interface TrayStatePayload {
  readonly state: TrayAppState;
  readonly unreadCount?: number;
}

export type TrayAction = 'open-chat' | 'new-message' | 'open-preferences';

function isTrayAppState(value: unknown): value is TrayAppState {
  return (
    value === 'idle' ||
    value === 'active' ||
    value === 'unread' ||
    value === 'error'
  );
}

export { isTrayAppState };
