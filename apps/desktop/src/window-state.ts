import type { DesktopSecurityReporter } from './desktop-security-reporting';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface DisplayBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
};

const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampDimension(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function intersectsDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
  display: DisplayBounds
): boolean {
  return (
    x < display.x + display.width &&
    x + width > display.x &&
    y < display.y + display.height &&
    y + height > display.y
  );
}

export function sanitizeWindowState(
  raw: unknown,
  displayBounds: DisplayBounds,
  report?: DesktopSecurityReporter,
  connectedDisplays?: readonly DisplayBounds[]
): WindowState {
  if (raw === null || typeof raw !== 'object') {
    return { ...DEFAULT_WINDOW_STATE };
  }

  const record = raw as Record<string, unknown>;
  const maxWidth = Math.max(displayBounds.width, MIN_WINDOW_WIDTH);
  const maxHeight = Math.max(displayBounds.height, MIN_WINDOW_HEIGHT);

  const width = clampDimension(
    isFiniteNumber(record.width) ? record.width : Number.NaN,
    MIN_WINDOW_WIDTH,
    maxWidth,
    DEFAULT_WINDOW_STATE.width
  );
  const height = clampDimension(
    isFiniteNumber(record.height) ? record.height : Number.NaN,
    MIN_WINDOW_HEIGHT,
    maxHeight,
    DEFAULT_WINDOW_STATE.height
  );

  const savedX = isFiniteNumber(record.x) ? record.x : undefined;
  const savedY = isFiniteNumber(record.y) ? record.y : undefined;
  // A window parked on a secondary display keeps its saved position verbatim —
  // clamping against only the primary work area would teleport it back on
  // relaunch. Only when the saved bounds intersect NO connected display (e.g.
  // a disconnected monitor) do we fall back to clamping into the primary.
  const keepSavedPosition =
    savedX !== undefined &&
    savedY !== undefined &&
    connectedDisplays !== undefined &&
    connectedDisplays.some(display =>
      intersectsDisplay(savedX, savedY, width, height, display)
    );

  let x: number | undefined;
  let y: number | undefined;
  let clamped = false;

  if (savedX !== undefined) {
    if (keepSavedPosition) {
      x = Math.round(savedX);
    } else {
      const minX = displayBounds.x;
      const maxX = displayBounds.x + displayBounds.width - width;
      const nextX = Math.min(Math.max(Math.round(savedX), minX), maxX);
      x = nextX;
      clamped ||= nextX !== savedX;
    }
  }

  if (savedY !== undefined) {
    if (keepSavedPosition) {
      y = Math.round(savedY);
    } else {
      const minY = displayBounds.y;
      const maxY = displayBounds.y + displayBounds.height - height;
      const nextY = Math.min(Math.max(Math.round(savedY), minY), maxY);
      y = nextY;
      clamped ||= nextY !== savedY;
    }
  }

  if (isFiniteNumber(record.width)) {
    clamped ||= width !== record.width;
  } else {
    clamped = true;
  }

  if (isFiniteNumber(record.height)) {
    clamped ||= height !== record.height;
  } else {
    clamped = true;
  }

  if (clamped) {
    report?.('window-state-clamped');
  }

  return { x, y, width, height };
}
