import type { MenuItemConstructorOptions } from 'electron';
import { expect, test, vi } from 'vitest';

// Capture Tray instances, menu templates, and generated icons so the
// MenuBarTray contract is verifiable without a real Electron runtime.
type FakeTray = {
  setToolTip: ReturnType<typeof vi.fn>;
  setImage: ReturnType<typeof vi.fn>;
  setTitle: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  destroyed: boolean;
};
type FakeIcon = {
  id: number;
  setTemplateImage: ReturnType<typeof vi.fn>;
  isEmpty: () => boolean;
};

const trayInstances: FakeTray[] = [];
const menuTemplates: MenuItemConstructorOptions[][] = [];
const createdIcons: FakeIcon[] = [];

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => {
      menuTemplates.push(template);
      return { template };
    }),
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => {
      const icon: FakeIcon = {
        id: createdIcons.length + 1,
        setTemplateImage: vi.fn(),
        isEmpty: () => false,
      };
      createdIcons.push(icon);
      return icon;
    }),
  },
  Tray: class {
    setToolTip = vi.fn();
    setImage = vi.fn();
    setTitle = vi.fn();
    setContextMenu = vi.fn();
    destroyed = false;
    isDestroyed = () => this.destroyed;
    destroy = vi.fn(() => {
      this.destroyed = true;
    });
    constructor() {
      trayInstances.push(this as unknown as FakeTray);
    }
  },
}));

const { MenuBarTray, isTrayAppState } = await import('../src/tray.ts');

function latestTray(): FakeTray {
  const tray = trayInstances[trayInstances.length - 1];
  expect(tray).toBeDefined();
  return tray;
}

function latestMenu(): MenuItemConstructorOptions[] {
  const template = menuTemplates[menuTemplates.length - 1];
  expect(template).toBeDefined();
  return template;
}

function statusLabel(template: MenuItemConstructorOptions[]): string {
  const first = template[0];
  expect(first?.enabled).toBe(false);
  return String(first?.label);
}

test('tray constructs with the Jovie tooltip and the menu-bar menu contract', () => {
  new MenuBarTray(() => {});
  const tray = latestTray();

  expect(tray.setToolTip).toHaveBeenCalledWith('Jovie');
  expect(createdIcons.length).toBeGreaterThan(0);
  for (const icon of createdIcons) {
    // macOS template images let the menu bar recolour for dark/light mode.
    expect(icon.setTemplateImage).toHaveBeenCalledWith(true);
  }

  const template = latestMenu();
  expect(template).toHaveLength(8);
  expect(statusLabel(template)).toBe('Jovie — Ready');
  expect(template[1]?.type).toBe('separator');
  expect(template[2]?.label).toBe('Open Chat');
  expect(template[3]?.label).toBe('New Message');
  expect(template[4]?.type).toBe('separator');
  expect(template[5]?.label).toBe('Preferences…');
  expect(template[6]?.type).toBe('separator');
  expect(template[7]?.label).toBe('Quit Jovie');
  expect(template[7]?.role).toBe('quit');
});

test('menu actions dispatch to the registered handler', () => {
  const onAction = vi.fn();
  new MenuBarTray(onAction);

  const clicks = new Map<string, () => void>();
  for (const item of latestMenu()) {
    if (item.click && item.label) clicks.set(item.label, () => item.click?.());
  }

  clicks.get('Open Chat')?.();
  clicks.get('New Message')?.();
  clicks.get('Preferences…')?.();

  expect(onAction.mock.calls.map(call => call[0])).toEqual([
    'open-chat',
    'new-message',
    'open-preferences',
  ]);
});

test('state updates drive title, tooltip, image, and status label', () => {
  const tray = new MenuBarTray(() => {});
  const instance = latestTray();
  const imagesBefore = instance.setImage.mock.calls.length;

  tray.setState({ state: 'active' });
  expect(instance.setToolTip).toHaveBeenLastCalledWith('Jovie — active run');
  expect(instance.setTitle).toHaveBeenLastCalledWith('…');
  expect(statusLabel(latestMenu())).toBe('Jovie — Active run…');

  tray.setState({ state: 'unread', unreadCount: 3 });
  expect(instance.setToolTip).toHaveBeenLastCalledWith(
    'Jovie — unread messages'
  );
  expect(instance.setTitle).toHaveBeenLastCalledWith('3');
  expect(statusLabel(latestMenu())).toBe('Jovie — 3 unread');

  tray.setState({ state: 'unread', unreadCount: 27 });
  expect(instance.setTitle).toHaveBeenLastCalledWith('9+');
  expect(statusLabel(latestMenu())).toBe('Jovie — 27 unread');

  tray.setState({ state: 'unread', unreadCount: 0 });
  expect(instance.setTitle).toHaveBeenLastCalledWith('');
  expect(statusLabel(latestMenu())).toBe('Jovie — Unread');

  tray.setState({ state: 'error' });
  expect(instance.setTitle).toHaveBeenLastCalledWith('!');
  expect(instance.setToolTip).toHaveBeenLastCalledWith('Jovie — error');
  expect(statusLabel(latestMenu())).toBe('Jovie — Error — click to review');

  tray.setState({ state: 'idle' });
  expect(instance.setTitle).toHaveBeenLastCalledWith('');
  expect(statusLabel(latestMenu())).toBe('Jovie — Ready');

  // Every applied state repaints the icon (dotted only while unread > 0).
  expect(instance.setImage.mock.calls.length).toBe(imagesBefore + 6);
});

test('invalid state payloads are ignored without touching the tray', () => {
  const tray = new MenuBarTray(() => {});
  const instance = latestTray();
  const callsBefore = {
    image: instance.setImage.mock.calls.length,
    title: instance.setTitle.mock.calls.length,
    menus: menuTemplates.length,
  };

  tray.setState({ state: 'bogus', unreadCount: 4 } as never);
  tray.setState({ state: 'unread', unreadCount: 'three' } as never);

  expect(instance.setImage.mock.calls.length).toBe(callsBefore.image + 1);
  // The malformed unread payload is a valid state; it clamps to zero unread.
  expect(statusLabel(latestMenu())).toBe('Jovie — Unread');
  expect(menuTemplates.length).toBe(callsBefore.menus + 1);

  tray.setState({ state: 'nope' } as never);
  expect(menuTemplates.length).toBe(callsBefore.menus + 1);
  expect(instance.setTitle.mock.calls.length).toBe(callsBefore.title + 1);
});

test('isTrayAppState admits only the known state literals', () => {
  for (const state of ['idle', 'active', 'unread', 'error']) {
    expect(isTrayAppState(state)).toBe(true);
  }
  for (const state of ['', 'Idle', 'busy', 'unread-count', null, 3]) {
    expect(isTrayAppState(state)).toBe(false);
  }
});

test('destroy tears down the tray once and is idempotent', () => {
  const tray = new MenuBarTray(() => {});
  const instance = latestTray();

  tray.destroy();
  expect(instance.destroy).toHaveBeenCalledTimes(1);

  tray.destroy();
  expect(instance.destroy).toHaveBeenCalledTimes(1);
});
