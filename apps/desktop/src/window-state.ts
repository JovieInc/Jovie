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

export function sanitizeWindowState(
  raw: unknown,
  displayBounds: DisplayBounds,
  report?: DesktopSecurityReporter
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

  let x: number | undefined;
  let y: number | undefined;
  let clamped = false;

  if (isFiniteNumber(record.x)) {
    const minX = displayBounds.x;
    const maxX = displayBounds.x + displayBounds.width - width;
    const nextX = Math.min(Math.max(Math.round(record.x), minX), maxX);
    x = nextX;
    clamped ||= nextX !== record.x;
  }

  if (isFiniteNumber(record.y)) {
    const minY = displayBounds.y;
    const maxY = displayBounds.y + displayBounds.height - height;
    const nextY = Math.min(Math.max(Math.round(record.y), minY), maxY);
    y = nextY;
    clamped ||= nextY !== record.y;
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
