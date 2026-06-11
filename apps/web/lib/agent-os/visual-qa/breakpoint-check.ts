import {
  isHorizontalOverflowAcceptable,
  type VisualQaBreakpoint,
} from '@/lib/visual-qa/breakpoints';

export interface VisualQaBreakpointCheckMeasurement {
  readonly horizontalOverflowPx: number;
  readonly primaryContentVisible: boolean;
}

export interface VisualQaBreakpointCheckDetail {
  readonly id: 'noHorizontalScroll' | 'primaryContentVisible';
  readonly passed: boolean;
  readonly message: string;
  readonly value?: number | boolean;
}

export interface VisualQaBreakpointCheckResult {
  readonly breakpoint: VisualQaBreakpoint;
  readonly passed: boolean;
  readonly checks: readonly VisualQaBreakpointCheckDetail[];
  readonly message: string;
}

export interface VisualQaSurfaceBreakpointReport {
  readonly surfaceId: string;
  readonly title: string;
  readonly passed: boolean;
  readonly breakpoints: readonly VisualQaBreakpointCheckResult[];
}

export interface VisualQaBreakpointReport {
  readonly runId: string;
  readonly checkedAt: string;
  readonly gitSha: string | null;
  readonly passed: boolean;
  readonly surfaces: readonly VisualQaSurfaceBreakpointReport[];
}

function evaluateNoHorizontalScroll(
  overflowPx: number
): VisualQaBreakpointCheckDetail {
  const passed = isHorizontalOverflowAcceptable(overflowPx);

  return {
    id: 'noHorizontalScroll',
    passed,
    value: overflowPx,
    message: passed
      ? `No horizontal scroll (${overflowPx}px overflow)`
      : `Horizontal scroll detected (${overflowPx}px overflow)`,
  };
}

function evaluatePrimaryContentVisible(
  visible: boolean
): VisualQaBreakpointCheckDetail {
  return {
    id: 'primaryContentVisible',
    passed: visible,
    value: visible,
    message: visible
      ? 'Primary content selector is visible'
      : 'Primary content selector is not visible',
  };
}

export function evaluateVisualQaBreakpointChecks(input: {
  readonly breakpoint: VisualQaBreakpoint;
  readonly measurement: VisualQaBreakpointCheckMeasurement;
}): VisualQaBreakpointCheckResult {
  const checks = [
    evaluateNoHorizontalScroll(input.measurement.horizontalOverflowPx),
    evaluatePrimaryContentVisible(input.measurement.primaryContentVisible),
  ];
  const passed = checks.every(check => check.passed);
  const failedChecks = checks.filter(check => !check.passed);

  return {
    breakpoint: input.breakpoint,
    passed,
    checks,
    message: passed
      ? `Breakpoint ${input.breakpoint.label}px passed responsive checks`
      : `Breakpoint ${input.breakpoint.label}px failed: ${failedChecks
          .map(check => check.id)
          .join(', ')}`,
  };
}

export function summarizeVisualQaSurfaceBreakpointReport(input: {
  readonly surfaceId: string;
  readonly title: string;
  readonly breakpoints: readonly VisualQaBreakpointCheckResult[];
}): VisualQaSurfaceBreakpointReport {
  const passed = input.breakpoints.every(result => result.passed);

  return {
    surfaceId: input.surfaceId,
    title: input.title,
    passed,
    breakpoints: input.breakpoints,
  };
}

export function summarizeVisualQaBreakpointReport(input: {
  readonly runId: string;
  readonly checkedAt: string;
  readonly gitSha?: string | null;
  readonly surfaces: readonly VisualQaSurfaceBreakpointReport[];
}): VisualQaBreakpointReport {
  return {
    runId: input.runId,
    checkedAt: input.checkedAt,
    gitSha: input.gitSha ?? null,
    passed: input.surfaces.every(surface => surface.passed),
    surfaces: input.surfaces,
  };
}

export function isVisualQaBreakpointReport(
  value: unknown
): value is VisualQaBreakpointReport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const report = value as Partial<VisualQaBreakpointReport>;
  return (
    typeof report.runId === 'string' &&
    typeof report.checkedAt === 'string' &&
    (typeof report.gitSha === 'string' || report.gitSha === null) &&
    typeof report.passed === 'boolean' &&
    Array.isArray(report.surfaces) &&
    report.surfaces.every(surface => {
      if (!surface || typeof surface !== 'object') {
        return false;
      }

      return (
        typeof surface.surfaceId === 'string' &&
        typeof surface.title === 'string' &&
        typeof surface.passed === 'boolean' &&
        Array.isArray(surface.breakpoints)
      );
    })
  );
}
