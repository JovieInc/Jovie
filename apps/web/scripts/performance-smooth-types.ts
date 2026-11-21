import type {
  SmoothPlatform,
  SmoothSurfaceId,
  smoothTargetsFor,
} from './performance-smooth-manifest';

export const SMOOTH_BASELINE_SCHEMA = 'jovie-smooth-baseline/v1' as const;

export interface SmoothRunSample {
  readonly attempt: number;
  readonly cls: number;
  readonly lcpMs: number;
  readonly inpMs: number | null;
  readonly fcpMs: number;
  readonly ttfbMs: number;
  readonly fullPageReloads: number;
  readonly duplicateFetches: number;
  readonly flickerEvents: number;
  readonly hydrationWarnings: number;
  readonly flickerReasons: readonly string[];
  readonly hydrationMessages: readonly string[];
  readonly finalUrl: string;
}

export interface SmoothSurfaceBaseline {
  readonly schema: typeof SMOOTH_BASELINE_SCHEMA;
  readonly surfaceId: SmoothSurfaceId;
  readonly label: string;
  readonly platform: SmoothPlatform;
  readonly routeId: string;
  readonly resolvedPath: string;
  readonly measuredAt: string;
  readonly baseUrl: string;
  readonly runs: number;
  readonly cpuThrottleRate: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly targets: ReturnType<typeof smoothTargetsFor>;
  readonly median: {
    readonly cls: number;
    readonly lcpMs: number;
    readonly inpMs: number | null;
    readonly fcpMs: number;
    readonly ttfbMs: number;
    readonly fullPageReloads: number;
    readonly duplicateFetches: number;
    readonly flickerEvents: number;
    readonly hydrationWarnings: number;
  };
  readonly flags: {
    readonly clsPass: boolean;
    readonly lcpPass: boolean;
    readonly inpPass: boolean;
    readonly reloadPass: boolean;
    readonly dupFetchPass: boolean;
    readonly flickerPass: boolean;
    readonly hydrationPass: boolean;
  };
  readonly samples: readonly SmoothRunSample[];
}

export interface SmoothBaselineSummary {
  readonly schema: 'jovie-smooth-baseline-summary/v1';
  readonly measuredAt: string;
  readonly baseUrl: string;
  readonly runsPerCell: number;
  readonly surfaces: readonly SmoothSurfaceBaseline[];
  readonly worstSurfaceId: SmoothSurfaceId | null;
  readonly worstReason: string | null;
}
