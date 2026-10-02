import { readFile } from 'node:fs/promises';
import type { Metadata } from 'next';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { buildFeatureReviewItems } from '@/lib/admin/founder-review-registry';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { resolveAppPath, resolveMonorepoPath } from '@/lib/filesystem-paths';

export const metadata: Metadata = {
  title: 'Feature Registry | Ovie',
};

/**
 * Deployed functions only contain apps/web, so the registry is read from the
 * copy staged by scripts/stage-runtime-data.mjs (and traced via
 * outputFileTracingIncludes). Local dev may not have staged runtime-data yet,
 * so fall back to the monorepo docs file.
 */
async function loadFeatureRegistryMarkdown(): Promise<string> {
  const candidates = [
    resolveAppPath('runtime-data', 'docs', 'FEATURE_REGISTRY.md'),
    resolveMonorepoPath('docs', 'FEATURE_REGISTRY.md'),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(/* turbopackIgnore: true */ candidate, 'utf8');
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

export default async function FeatureRegistryPage() {
  await requireCurrentAdminPageAccess();
  const markdown = await loadFeatureRegistryMarkdown();
  const items = buildFeatureReviewItems(markdown);

  return (
    <AdminPage
      title='Feature Registry'
      description='Canonical Jovie capabilities with attached evidence and local founder taste certification.'
      testId='admin-feature-registry-page'
    >
      <FounderReviewRegistry kind='feature' items={items} />
    </AdminPage>
  );
}
