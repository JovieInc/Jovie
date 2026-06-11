import type { VisualQaViewportSize } from '@/lib/visual-qa/types';

/**
 * Canonical QA viewport widths from docs/design-system/responsive-system.md.
 */
export const VISUAL_QA_BREAKPOINT_WIDTHS = [
  320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1536,
] as const;

export type VisualQaBreakpointWidth =
  (typeof VISUAL_QA_BREAKPOINT_WIDTHS)[number];

export const VISUAL_QA_COMPACT_BREAKPOINT_WIDTHS = [
  320, 360, 375, 390, 414,
] as const satisfies readonly VisualQaBreakpointWidth[];

export type VisualQaBreakpointPreset = 'all' | 'compact';

export type VisualQaBreakpointRequest = VisualQaBreakpointPreset | 'custom';

export interface VisualQaBreakpoint extends VisualQaViewportSize {
  readonly label: string;
}

const MAX_HORIZONTAL_OVERFLOW_PX = 1;

function resolveBreakpointHeight(width: number): number {
  if (width < 500) {
    return 844;
  }

  if (width < 900) {
    return 1024;
  }

  return 900;
}

export function createVisualQaBreakpoint(
  width: VisualQaBreakpointWidth
): VisualQaBreakpoint {
  return {
    width,
    height: resolveBreakpointHeight(width),
    label: String(width),
  };
}

export function isVisualQaBreakpointWidth(
  value: number
): value is VisualQaBreakpointWidth {
  return (VISUAL_QA_BREAKPOINT_WIDTHS as readonly number[]).includes(value);
}

export function parseVisualQaBreakpointToken(
  value: string
): VisualQaBreakpointRequest {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'compact') {
    return normalized;
  }

  return 'custom';
}

export function resolveVisualQaBreakpoints(input: {
  readonly preset?: VisualQaBreakpointRequest;
  readonly customWidths?: readonly number[];
}): readonly VisualQaBreakpoint[] {
  const preset = input.preset ?? 'all';

  if (preset === 'compact') {
    return VISUAL_QA_COMPACT_BREAKPOINT_WIDTHS.map(createVisualQaBreakpoint);
  }

  if (preset === 'all') {
    return VISUAL_QA_BREAKPOINT_WIDTHS.map(createVisualQaBreakpoint);
  }

  const widths = (input.customWidths ?? []).filter(isVisualQaBreakpointWidth);
  if (widths.length === 0) {
    throw new Error(
      'Visual QA breakpoint checks require at least one canonical width from docs/design-system/responsive-system.md.'
    );
  }

  return [...new Set(widths)]
    .sort((left, right) => left - right)
    .map(createVisualQaBreakpoint);
}

export function parseVisualQaBreakpointWidths(
  value?: string | null
): readonly VisualQaBreakpoint[] {
  const raw = value?.trim() ?? '';
  if (raw.length === 0 || raw.toLowerCase() === 'all') {
    return resolveVisualQaBreakpoints({ preset: 'all' });
  }

  if (raw.toLowerCase() === 'compact') {
    return resolveVisualQaBreakpoints({ preset: 'compact' });
  }

  const customWidths = raw
    .split(',')
    .map(token => Number.parseInt(token.trim(), 10))
    .filter(width => Number.isFinite(width));

  return resolveVisualQaBreakpoints({
    preset: 'custom',
    customWidths,
  });
}

export function isHorizontalOverflowAcceptable(overflowPx: number): boolean {
  return overflowPx <= MAX_HORIZONTAL_OVERFLOW_PX;
}
