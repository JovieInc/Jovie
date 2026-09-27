import type { Metadata } from 'next';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { buildDesignSystemReviewItems } from '@/lib/admin/founder-review-registry';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Design System Registry | Ovie',
};

export default async function DesignSystemRegistryPage() {
  await requireCurrentAdminPageAccess();
  const items = buildDesignSystemReviewItems();

  return (
    <AdminPage
      title='Design System Registry'
      description='Review canonical component ownership, rendered references, evidence gaps, and founder-ready design packets.'
      testId='admin-design-system-registry-page'
    >
      <FounderReviewRegistry kind='design-system' items={items} />
    </AdminPage>
  );
}
