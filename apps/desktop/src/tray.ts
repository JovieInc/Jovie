import * as zlib from 'node:zlib';
import { deflateSync } from 'node:zlib';
import {
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  Tray,
} from 'electron';

export type TrayAppState = 'idle' | 'active' | 'unread' | 'error';

export interface TrayStatePayload {
  readonly state: TrayAppState;
  readonly unreadCount?: number;
}

export type TrayAction = 'open-chat' | 'new-message' | 'open-preferences';

// ponytail: zlib.crc32 added in Node.js 22.2.0; repo requires 22.13+
const zlibWithCrc = zlib as typeof zlib & {
  crc32(data: Buffer, crc?: number): number;
};

function pngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(zlibWithCrc.crc32(data, zlibWithCrc.crc32(typeBuf)), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Builds an RGBA PNG Buffer containing a filled circle.
 * withDot=true adds a smaller circle at top-right for the unread state.
 * The resulting NativeImage should be marked as a template image so
 * macOS handles dark/light mode colourisation automatically.
 */
function buildCirclePng(size: number, withDot: boolean): Buffer {
  const rowStride = size * 4 + 1; // 1 filter byte + 4 RGBA bytes per pixel
  const raw = Buffer.alloc(rowStride * size, 0); // transparent by default
  const c = (size - 1) / 2;
  const mainR = c * 0.68;

  for (let y = 0; y < size; y++) {
    raw[y * rowStride] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      let opaque = dx * dx + dy * dy <= mainR * mainR;

      if (withDot) {
        const dotCx = size * 0.75;
        const dotCy = size * 0.22;
        const dotR = size * 0.18;
        const ddx = x - dotCx;
        const ddy = y - dotCy;
        opaque = opaque || ddx * ddx + ddy * ddy <= dotR * dotR;
      }

      if (opaque) {
        // R=0, G=0, B=0 (black); A=255 — template image, OS recolours it
        raw[y * rowStride + 1 + x * 4 + 3] = 255;
      }
    }
  }

  // Buffer.alloc (zero-filled): bytes 10-12 must be 0
  // (compression=0, filter=0, interlace=0)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 44px buffer rendered at scaleFactor=2 → 22pt logical size in the menu bar
const TRAY_RENDER_PX = 44;
const TRAY_SCALE = 2;

let baseIcon: ReturnType<typeof nativeImage.createFromBuffer> | null = null;
let dotIcon: ReturnType<typeof nativeImage.createFromBuffer> | null = null;

function getIcon(withDot: boolean) {
  if (withDot) {
    if (!dotIcon) {
      dotIcon = nativeImage.createFromBuffer(
        buildCirclePng(TRAY_RENDER_PX, true),
        {
          scaleFactor: TRAY_SCALE,
        }
      );
      dotIcon.setTemplateImage(true);
    }
    return dotIcon;
  }
  if (!baseIcon) {
    baseIcon = nativeImage.createFromBuffer(
      buildCirclePng(TRAY_RENDER_PX, false),
      {
        scaleFactor: TRAY_SCALE,
      }
    );
    baseIcon.setTemplateImage(true);
  }
  return baseIcon;
}

const TOOLTIP: Record<TrayAppState, string> = {
  idle: 'Jovie',
  active: 'Jovie — active run',
  unread: 'Jovie — unread messages',
  error: 'Jovie — error',
};

const STATE_TITLE: Record<TrayAppState, string> = {
  idle: '',
  active: '…',
  unread: '', // replaced with count when unreadCount > 0
  error: '!',
};

const STATE_LABEL: Record<TrayAppState, string> = {
  idle: 'Ready',
  active: 'Active run…',
  unread: 'Unread',
  error: 'Error — click to review',
};

/**
 * MenuBarTray wraps Electron's Tray (which wraps NSStatusItem on macOS).
 * Create one instance when the app is ready on macOS; call destroy() on quit.
 */
export class MenuBarTray {
  private readonly tray: Tray;
  private state: TrayAppState = 'idle';
  private unreadCount = 0;
  private readonly onAction: (action: TrayAction) => void;

  constructor(onAction: (action: TrayAction) => void) {
    this.tray = new Tray(getIcon(false));
    this.tray.setToolTip('Jovie');
    this.onAction = onAction;
    this.rebuildMenu();
  }

  setState(payload: TrayStatePayload): void {
    if (!isTrayAppState(payload.state)) return;
    this.state = payload.state;
    this.unreadCount =
      typeof payload.unreadCount === 'number' && payload.unreadCount >= 0
        ? Math.floor(payload.unreadCount)
        : 0;
    this.applyVisuals();
    this.rebuildMenu();
  }

  destroy(): void {
    if (!this.tray.isDestroyed()) this.tray.destroy();
    baseIcon = null;
    dotIcon = null;
  }

  private applyVisuals(): void {
    const hasUnread = this.state === 'unread' && this.unreadCount > 0;
    this.tray.setImage(getIcon(hasUnread));
    this.tray.setToolTip(TOOLTIP[this.state]);
    const title = hasUnread
      ? this.unreadCount > 9
        ? '9+'
        : String(this.unreadCount)
      : STATE_TITLE[this.state];
    this.tray.setTitle(title);
  }

  private rebuildMenu(): void {
    const hasUnread = this.state === 'unread' && this.unreadCount > 0;
    const stateLabel = hasUnread
      ? `${this.unreadCount} unread`
      : STATE_LABEL[this.state];

    const template: MenuItemConstructorOptions[] = [
      { label: `Jovie — ${stateLabel}`, enabled: false },
      { type: 'separator' },
      { label: 'Open Chat', click: () => this.onAction('open-chat') },
      { label: 'New Message', click: () => this.onAction('new-message') },
      { type: 'separator' },
      { label: 'Preferences…', click: () => this.onAction('open-preferences') },
      { type: 'separator' },
      { label: 'Quit Jovie', role: 'quit' },
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }
}

function isTrayAppState(value: unknown): value is TrayAppState {
  return (
    value === 'idle' ||
    value === 'active' ||
    value === 'unread' ||
    value === 'error'
  );
}

export { isTrayAppState };
