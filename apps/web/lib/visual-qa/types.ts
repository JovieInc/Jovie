import type { CanonicalSurfaceId } from '@/lib/canonical-surfaces';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';

export const VISUAL_QA_PHASES = ['baseline', 'after'] as const;

export type VisualQaPhase = (typeof VISUAL_QA_PHASES)[number];

export type VisualQaViewport = 'desktop' | 'mobile';

export type VisualQaCaptureTarget = 'page' | 'locator';

export interface VisualQaCaptureConfig {
  readonly route: string;
  readonly waitFor: string;
  readonly viewport: VisualQaViewport;
  readonly colorScheme?: VisualQaColorScheme;
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
  readonly themes?: readonly VisualQaColorScheme[];
  readonly baseline: VisualQaCaptureConfig;
  readonly after?: Partial<VisualQaCaptureConfig>;
}

export interface VisualQaViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface VisualQaPhaseCaptureRecord {
  readonly baselinePath: string;
  readonly afterPath: string;
  readonly baselineCapturedAt: string | null;
  readonly afterCapturedAt: string | null;
}

export interface VisualQaSurfaceCaptureRecord {
  readonly surfaceId: string;
  readonly title: string;
  readonly viewport: VisualQaViewportSize;
  readonly themes: Partial<
    Record<VisualQaColorScheme, VisualQaPhaseCaptureRecord>
  >;
}

export interface VisualQaRunManifest {
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly gitSha: string | null;
  readonly surfaces: readonly VisualQaSurfaceCaptureRecord[];
}

function isVisualQaPhaseCaptureRecord(
  value: unknown
): value is VisualQaPhaseCaptureRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<VisualQaPhaseCaptureRecord>;
  return (
    typeof record.baselinePath === 'string' &&
    typeof record.afterPath === 'string' &&
    (typeof record.baselineCapturedAt === 'string' ||
      record.baselineCapturedAt === null) &&
    (typeof record.afterCapturedAt === 'string' ||
      record.afterCapturedAt === null)
  );
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

      const themes = surface.themes;
      const hasValidThemes =
        !!themes &&
        typeof themes === 'object' &&
        Object.values(themes).every(themeRecord =>
          isVisualQaPhaseCaptureRecord(themeRecord)
        );

      return (
        typeof surface.surfaceId === 'string' &&
        typeof surface.title === 'string' &&
        hasValidThemes &&
        typeof surface.viewport?.width === 'number' &&
        typeof surface.viewport?.height === 'number'
      );
    })
  );
}
