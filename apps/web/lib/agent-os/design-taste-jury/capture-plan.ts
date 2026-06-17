import { getSurfaceBenchmark } from '@/lib/agent-os/design-taste-jury/benchmarks';
import type {
  DesignTasteCaptureMode,
  DesignTasteCapturePlan,
  DesignTasteCaptureTarget,
  DesignTasteChangeScope,
} from '@/lib/agent-os/design-taste-jury/types';
import {
  CANONICAL_SURFACES_BY_ID,
  type CanonicalSurfaceId,
} from '@/lib/canonical-surfaces';
import { getVisualQaSurface } from '@/lib/visual-qa/registry';

function resolveCaptureMode(surfaceId: string): DesignTasteCaptureMode {
  const category = getSurfaceBenchmark(surfaceId).category;
  return category === 'marketing' || category === 'public-profile'
    ? 'device-mockup'
    : 'raw';
}

function buildCanonicalCaptureTarget(
  surfaceId: CanonicalSurfaceId,
  reason: string
): DesignTasteCaptureTarget {
  const surface = CANONICAL_SURFACES_BY_ID[surfaceId];

  return {
    surfaceId,
    title: surface.label,
    captureMode: resolveCaptureMode(surfaceId),
    reviewRoute: surface.reviewRoute,
    reason,
  };
}

function buildVisualQaCaptureTarget(
  surfaceId: string,
  reason: string
): DesignTasteCaptureTarget | null {
  const surface = getVisualQaSurface(surfaceId);
  if (!surface) {
    return null;
  }

  return {
    surfaceId,
    title: surface.title,
    captureMode: resolveCaptureMode(surfaceId),
    reviewRoute: surface.baseline.route,
    reason,
  };
}

export function buildDesignTasteCapturePlan(params: {
  readonly runId: string;
  readonly changeScope: DesignTasteChangeScope;
  readonly createdAt?: string;
}): DesignTasteCapturePlan {
  const createdAt = params.createdAt ?? new Date().toISOString();

  if (!params.changeScope.hasUiChanges) {
    return {
      runId: params.runId,
      createdAt,
      skipped: true,
      skipReason: params.changeScope.skipReason,
      targets: [],
      unchangedSurfaceIds: params.changeScope.unchangedSurfaceIds,
    };
  }

  const targets = new Map<string, DesignTasteCaptureTarget>();

  for (const surfaceId of params.changeScope.affectedCanonicalSurfaceIds) {
    targets.set(
      surfaceId,
      buildCanonicalCaptureTarget(
        surfaceId as CanonicalSurfaceId,
        'Canonical surface touched by changed UI files.'
      )
    );
  }

  for (const surfaceId of params.changeScope.affectedVisualQaSurfaceIds) {
    const target = buildVisualQaCaptureTarget(
      surfaceId,
      'Visual QA surface touched by changed UI files.'
    );
    if (target) {
      targets.set(surfaceId, target);
    }
  }

  return {
    runId: params.runId,
    createdAt,
    skipped: targets.size === 0,
    skipReason:
      targets.size === 0
        ? 'UI files changed, but no declared surfaces mapped to the diff.'
        : null,
    targets: [...targets.values()].sort((left, right) =>
      left.surfaceId.localeCompare(right.surfaceId)
    ),
    unchangedSurfaceIds: params.changeScope.unchangedSurfaceIds,
  };
}
