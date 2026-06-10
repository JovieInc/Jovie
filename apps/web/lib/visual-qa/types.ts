import type { CanonicalSurfaceId } from '@/lib/canonical-surfaces';

export const VISUAL_QA_PHASES = ['baseline', 'after'] as const;

export type VisualQaPhase = (typeof VISUAL_QA_PHASES)[number];

export type VisualQaViewport = 'desktop' | 'mobile';

export type VisualQaCaptureTarget = 'page' | 'locator';

export interface VisualQaCaptureConfig {
  readonly route: string;
  readonly waitFor: string;
  readonly viewport: VisualQaViewport;
  readonly captureTarget?: VisualQaCaptureTarget;
  readonly captureSelector?: string;
  readonly fullPage?: boolean;
  readonly flagOverrides?: Readonly<Record<string, boolean>>;
  readonly fixedNow?: string;
  readonly reducedMotion?: boolean;
}

export interface VisualQaSurface {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly parityLedgerGroup?: string;
  readonly canonicalSurfaceId?: CanonicalSurfaceId;
  readonly baseline: VisualQaCaptureConfig;
  readonly after?: Partial<VisualQaCaptureConfig>;
}

export interface VisualQaViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface VisualQaSurfaceCaptureRecord {
  readonly surfaceId: string;
  readonly title: string;
  readonly baselinePath: string;
  readonly afterPath: string;
  readonly baselineCapturedAt: string | null;
  readonly afterCapturedAt: string | null;
  readonly viewport: VisualQaViewportSize;
}

export interface VisualQaRunManifest {
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly gitSha: string | null;
  readonly surfaces: readonly VisualQaSurfaceCaptureRecord[];
}

export function isVisualQaRunManifest(
  value: unknown
): value is VisualQaRunManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manifest = value as Partial<VisualQaRunManifest>;
  return (
    typeof manifest.runId === 'string' &&
    typeof manifest.createdAt === 'string' &&
    typeof manifest.updatedAt === 'string' &&
    (typeof manifest.gitSha === 'string' || manifest.gitSha === null) &&
    Array.isArray(manifest.surfaces) &&
    manifest.surfaces.every(surface => {
      if (!surface || typeof surface !== 'object') {
        return false;
      }

      return (
        typeof surface.surfaceId === 'string' &&
        typeof surface.title === 'string' &&
        typeof surface.baselinePath === 'string' &&
        typeof surface.afterPath === 'string' &&
        (typeof surface.baselineCapturedAt === 'string' ||
          surface.baselineCapturedAt === null) &&
        (typeof surface.afterCapturedAt === 'string' ||
          surface.afterCapturedAt === null) &&
        typeof surface.viewport?.width === 'number' &&
        typeof surface.viewport?.height === 'number'
      );
    })
  );
}
