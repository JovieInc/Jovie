import type { CanonicalSurfaceId } from '@/lib/canonical-surfaces';

export type ScreenshotGroup =
  | 'marketing'
  | 'onboarding'
  | 'dashboard'
  | 'settings'
  | 'public-profile';

export type ScreenshotViewport = 'desktop' | 'mobile';

export type ScreenshotTheme = 'default' | 'dark';

export type ScreenshotConsumer =
  | 'admin'
  | 'marketing-export'
  | 'investor-ready';

export type ScreenshotInteraction =
  | 'none'
  | 'open-first-release'
  | 'open-first-release-dsps';

export type ScreenshotCaptureTarget = 'page' | 'locator';

export interface ScreenshotCanonicalSurfaceMetadata {
  readonly canonicalSurfaceId?: CanonicalSurfaceId;
  readonly canonicalSurfaceLabel?: string;
  readonly canonicalSurfaceReviewRoute?: string;
}

export interface ScreenshotScenario {
  readonly id: string;
  readonly title: string;
  readonly group: ScreenshotGroup;
  readonly groupLabel: string;
  readonly route: string;
  readonly waitFor: string;
  readonly viewport: ScreenshotViewport;
  readonly theme: ScreenshotTheme;
  readonly consumers: readonly ScreenshotConsumer[];
  readonly fullPage: boolean;
  readonly captureTarget?: ScreenshotCaptureTarget;
  readonly captureSelector?: string;
  readonly interaction?: ScreenshotInteraction;
  readonly publicExportPath?: string;
  readonly fixedNow?: string;
  readonly reducedMotion?: boolean;
}

export interface ScreenshotScenario
  extends ScreenshotCanonicalSurfaceMetadata {}

export interface ScreenshotManifestEntry {
  readonly id: string;
  readonly title: string;
  readonly group: ScreenshotGroup;
  readonly groupLabel: string;
  readonly route: string;
  readonly viewport: ScreenshotViewport;
  readonly theme: ScreenshotTheme;
  readonly consumers: readonly ScreenshotConsumer[];
  readonly capturedAt: string;
  readonly gitSha: string | null;
  readonly imagePath: string;
  readonly publicExportPath?: string;
}

export interface ScreenshotManifestEntry
  extends ScreenshotCanonicalSurfaceMetadata {}

export interface ScreenshotCatalogEntry extends ScreenshotManifestEntry {
  readonly sizeBytes: number;
  readonly url: string;
  readonly publicUrl?: string;
}

export function isScreenshotManifestEntry(
  value: unknown
): value is ScreenshotManifestEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<ScreenshotManifestEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.group === 'string' &&
    typeof entry.groupLabel === 'string' &&
    typeof entry.route === 'string' &&
    typeof entry.viewport === 'string' &&
    typeof entry.theme === 'string' &&
    Array.isArray(entry.consumers) &&
    entry.consumers.every(consumer => typeof consumer === 'string') &&
    typeof entry.capturedAt === 'string' &&
    typeof entry.imagePath === 'string' &&
    (typeof entry.gitSha === 'string' || entry.gitSha === null) &&
    (typeof entry.canonicalSurfaceId === 'string' ||
      entry.canonicalSurfaceId === undefined) &&
    (typeof entry.canonicalSurfaceLabel === 'string' ||
      entry.canonicalSurfaceLabel === undefined) &&
    (typeof entry.canonicalSurfaceReviewRoute === 'string' ||
      entry.canonicalSurfaceReviewRoute === undefined) &&
    (typeof entry.publicExportPath === 'string' ||
      entry.publicExportPath === undefined)
  );
}
