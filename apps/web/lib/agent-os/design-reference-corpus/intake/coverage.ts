import type { DesignReferenceCorpus } from '../types';
import {
  type DesignRefsIntakeConfig,
  expandSurfaceTags,
  type IntakeSurfaceId,
} from './config';

export interface SurfaceReferenceCoverage {
  readonly surface: IntakeSurfaceId;
  readonly referenceCount: number;
  readonly referenceIds: readonly string[];
  readonly meetsMinimum: boolean;
}

export function referenceMatchesSurface(
  config: DesignRefsIntakeConfig,
  surface: IntakeSurfaceId,
  tagSurfaces: readonly string[] | undefined
): boolean {
  if (!tagSurfaces?.length) return false;
  const expanded = expandSurfaceTags(config, surface);
  return tagSurfaces.some(tag => expanded.has(tag.toLowerCase()));
}

export function coverageForSurface(
  config: DesignRefsIntakeConfig,
  corpus: DesignReferenceCorpus,
  surface: IntakeSurfaceId
): SurfaceReferenceCoverage {
  const referenceIds: string[] = [];
  for (const record of Object.values(corpus.references)) {
    if (
      record.status === 'rejected' ||
      !referenceMatchesSurface(config, surface, record.reference.tags?.surfaces)
    ) {
      continue;
    }
    referenceIds.push(record.reference.id);
  }
  referenceIds.sort();
  const min = config.minReferencesPerSurface;
  return {
    surface,
    referenceCount: referenceIds.length,
    referenceIds,
    meetsMinimum: referenceIds.length >= min,
  };
}

export function coverageReport(
  config: DesignRefsIntakeConfig,
  corpus: DesignReferenceCorpus
): SurfaceReferenceCoverage[] {
  return config.surfaces.map(entry =>
    coverageForSurface(config, corpus, entry.id as IntakeSurfaceId)
  );
}
