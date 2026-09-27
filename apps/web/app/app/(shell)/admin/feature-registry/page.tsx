import { readFile } from 'node:fs/promises';
import type { Metadata } from 'next';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { buildFeatureReviewItems } from '@/lib/admin/founder-review-registry';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';

export const metadata: Metadata = {
  title: 'Feature Registry | Ovie',
};

export default async function FeatureRegistryPage() {
  await requireCurrentAdminPageAccess();
  const markdown = await readFile(
    resolveMonorepoPath('docs', 'FEATURE_REGISTRY.md'),
    'utf8'
  );
  const items = buildFeatureReviewItems(markdown);

  return (
    <AdminPage
      title='Feature Registry'
      description='Inspect canonical Jovie capabilities, attached product evidence, and the subset ready for local founder taste certification.'
      testId='admin-feature-registry-page'
    >
      <FounderReviewRegistry kind='feature' items={items} />
    </AdminPage>
  );
}
