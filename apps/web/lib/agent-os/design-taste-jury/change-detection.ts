import type { DesignTasteChangeScope } from '@/lib/agent-os/design-taste-jury/types';
import {
  CANONICAL_SURFACES,
  type CanonicalSurfaceId,
} from '@/lib/canonical-surfaces';
import { VISUAL_QA_SURFACES } from '@/lib/visual-qa/registry';

const CANONICAL_SURFACE_PATH_HINTS: Record<
  CanonicalSurfaceId,
  readonly string[]
> = {
  homepage: ['app/(home)/', 'features/home', 'homepage'],
  'public-profile': [
    'app/[username]/',
    'features/profile',
    'staticartistpage',
    'profile-compact-template',
  ],
  'release-landing': ['app/r/[slug]', 'release-landing', 'features/release'],
  'dashboard-releases': [
    'dashboard/releases',
    'release-provider-matrix',
    'releasesexperience',
  ],
  'dashboard-audience': [
    'dashboard/audience',
    'dashboardaudience',
    'features/dashboard/organisms/dashboardaudience',
  ],
  'dashboard-insights': [
    'dashboard/insights',
    'insightspanel',
    'features/dashboard/insights',
  ],
  'dashboard-earnings': [
    'dashboard-pay',
    'dashboardpay',
    'features/dashboard/dashboard-pay',
    'settings/artist-profile',
  ],
  'settings-artist-profile': [
    'settings/artist-profile',
    'artistprofilecontent',
    'settings-profile-section',
  ],
  'settings-links': [
    'grouped-links',
    'groupedlinksmanager',
    'settings/artist-profile',
    'demo/showcase/links',
  ],
};

const VISUAL_QA_SURFACE_PATH_HINTS: Record<string, readonly string[]> = {
  'shell-desktop-idle': [
    'app/exp/shell-v1',
    'components/features/shell',
    'shell-v1',
  ],
  'list-releases-default': [
    'release-provider-matrix',
    'releases-matrix',
    'dashboard/releases',
  ],
  'drawer-release-open': [
    'release-provider-matrix',
    'shell-v1-release-drawer',
    'release-drawer',
  ],
  'settings-root-hierarchy': [
    'demo/showcase/settings',
    'settings-profile-section',
    'demo-settings',
  ],
};

const UI_PATH_PREFIXES = [
  'apps/web/app/',
  'apps/web/components/',
  'apps/web/features/',
  'packages/ui/',
  'apps/web/data/',
  'apps/web/styles/',
] as const;

const UI_PATH_SUFFIXES = [
  'apps/web/tailwind.config.ts',
  'apps/web/tailwind.config.js',
  'apps/web/app/globals.css',
] as const;

const NON_UI_PATH_PREFIXES = [
  'apps/web/app/api/',
  'apps/web/drizzle/',
  'drizzle/',
  'apps/web/scripts/',
  'scripts/',
  'docs/',
  '.github/',
  'apps/web/tests/',
  'apps/web/lib/db/',
  'apps/web/lib/env',
  'apps/web/lib/stripe/',
  'apps/web/lib/billing/',
] as const;

const GLOBAL_UI_PREFIXES = [
  'packages/ui/',
  'apps/web/components/atoms/',
  'apps/web/components/molecules/',
  'apps/web/app/globals.css',
  'apps/web/tailwind.config.',
] as const;

function normalizeChangedFile(filePath: string): string {
  return filePath.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesPrefix(filePath: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    prefix => filePath === prefix || filePath.startsWith(prefix)
  );
}

export function isUiChangedFile(filePath: string): boolean {
  const normalized = normalizeChangedFile(filePath);

  if (matchesPrefix(normalized, NON_UI_PATH_PREFIXES)) {
    return false;
  }

  if (matchesPrefix(normalized, UI_PATH_PREFIXES)) {
    return true;
  }

  return UI_PATH_SUFFIXES.some(suffix => normalized === suffix);
}

function fileTouchesCanonicalSurface(
  filePath: string,
  surfaceId: CanonicalSurfaceId
): boolean {
  const normalized = normalizeChangedFile(filePath).toLowerCase();
  const hints = CANONICAL_SURFACE_PATH_HINTS[surfaceId] ?? [surfaceId];

  return hints.some(hint => normalized.includes(hint.toLowerCase()));
}

function fileTouchesVisualQaSurface(
  filePath: string,
  surfaceId: string
): boolean {
  const normalized = normalizeChangedFile(filePath).toLowerCase();
  const hints = VISUAL_QA_SURFACE_PATH_HINTS[surfaceId] ?? [surfaceId];

  return hints.some(hint => normalized.includes(hint.toLowerCase()));
}

function isGlobalUiChange(filePath: string): boolean {
  return matchesPrefix(normalizeChangedFile(filePath), GLOBAL_UI_PREFIXES);
}

export function resolveAffectedCanonicalSurfaceIds(
  changedFiles: readonly string[]
): CanonicalSurfaceId[] {
  const uiChangedFiles = changedFiles
    .map(normalizeChangedFile)
    .filter(isUiChangedFile);

  if (uiChangedFiles.length === 0) {
    return [];
  }

  const hasGlobalUiChange = uiChangedFiles.some(isGlobalUiChange);
  if (hasGlobalUiChange) {
    return CANONICAL_SURFACES.map(surface => surface.id);
  }

  const affected = new Set<CanonicalSurfaceId>();

  for (const filePath of uiChangedFiles) {
    for (const surface of CANONICAL_SURFACES) {
      if (fileTouchesCanonicalSurface(filePath, surface.id)) {
        affected.add(surface.id);
      }
    }
  }

  return [...affected].sort();
}

export function resolveAffectedVisualQaSurfaceIds(
  changedFiles: readonly string[]
): string[] {
  const uiChangedFiles = changedFiles
    .map(normalizeChangedFile)
    .filter(isUiChangedFile);

  if (uiChangedFiles.length === 0) {
    return [];
  }

  const hasGlobalUiChange = uiChangedFiles.some(isGlobalUiChange);
  if (hasGlobalUiChange) {
    return VISUAL_QA_SURFACES.map(surface => surface.id);
  }

  const affected = new Set<string>();

  for (const filePath of uiChangedFiles) {
    for (const surface of VISUAL_QA_SURFACES) {
      if (fileTouchesVisualQaSurface(filePath, surface.id)) {
        affected.add(surface.id);
      }
    }
  }

  return [...affected].sort();
}

export function analyzeDesignTasteChangeScope(
  changedFiles: readonly string[]
): DesignTasteChangeScope {
  const normalizedFiles = changedFiles.map(normalizeChangedFile);
  const uiChangedFiles = normalizedFiles.filter(isUiChangedFile);
  const hasUiChanges = uiChangedFiles.length > 0;

  const affectedCanonicalSurfaceIds =
    resolveAffectedCanonicalSurfaceIds(normalizedFiles);
  const affectedVisualQaSurfaceIds =
    resolveAffectedVisualQaSurfaceIds(normalizedFiles);

  const allSurfaceIds = new Set([
    ...CANONICAL_SURFACES.map(surface => surface.id),
    ...VISUAL_QA_SURFACES.map(surface => surface.id),
  ]);

  const affectedSurfaceIds = new Set([
    ...affectedCanonicalSurfaceIds,
    ...affectedVisualQaSurfaceIds,
  ]);

  const unchangedSurfaceIds = [...allSurfaceIds]
    .filter(surfaceId => !affectedSurfaceIds.has(surfaceId))
    .sort();

  return {
    hasUiChanges,
    skipReason: hasUiChanges
      ? null
      : 'No UI-impacting files changed; screenshot capture skipped.',
    changedFiles: normalizedFiles,
    affectedCanonicalSurfaceIds,
    affectedVisualQaSurfaceIds,
    unchangedSurfaceIds,
  };
}
