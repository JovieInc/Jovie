import 'server-only';

import { readFile, stat } from 'node:fs/promises';
import {
  buildFeatureReviewItems,
  type FounderReviewItem,
} from '@/lib/admin/founder-review-registry';
import { resolveAppPath, resolveMonorepoPath } from '@/lib/filesystem-paths';

export interface FeatureRegistrySource {
  readonly markdown: string;
  /** mtime of the registry file the packets were derived from. */
  readonly sourceUpdatedAt: string;
}

/**
 * Deployed functions only contain apps/web, so the registry is read from the
 * copy staged by scripts/stage-runtime-data.mjs (and traced via
 * outputFileTracingIncludes). Local dev may not have staged runtime-data yet,
 * so fall back to the monorepo docs file.
 */
export async function loadFeatureRegistrySource(): Promise<FeatureRegistrySource> {
  const candidates = [
    resolveAppPath('runtime-data', 'docs', 'FEATURE_REGISTRY.md'),
    resolveMonorepoPath('docs', 'FEATURE_REGISTRY.md'),
  ];

  for (const candidate of candidates) {
    try {
      const markdown = await readFile(
        /* turbopackIgnore: true */ candidate,
        'utf8'
      );
      const updatedAt = await stat(/* turbopackIgnore: true */ candidate)
        .then(stats => stats.mtime.toISOString())
        .catch(() => new Date().toISOString());
      return { markdown, sourceUpdatedAt: updatedAt };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    `FEATURE_REGISTRY.md not found. Tried: ${candidates.join(', ')}`
  );
}

/**
 * The certification inventory's view of the Feature Registry: every item's
 * kernel packet plus the registry revision the decision ledger binds to.
 */
export async function readFeatureRegistrySource(): Promise<{
  readonly items: readonly FounderReviewItem[];
  readonly sourceUpdatedAt: string;
}> {
  const source = await loadFeatureRegistrySource();
  return {
    items: buildFeatureReviewItems(source.markdown),
    sourceUpdatedAt: source.sourceUpdatedAt,
  };
}
