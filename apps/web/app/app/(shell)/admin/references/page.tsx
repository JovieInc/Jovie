import type { Metadata } from 'next';
import { ReferenceReview } from '@/components/features/admin/reference-review/ReferenceReview';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'References',
  robots: NOINDEX_ROBOTS,
};
export default async function ReferenceReviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ context?: string; branch?: string }>;
}) {
  await requireCurrentAdminPageAccess();
  const params = await searchParams;
  return (
    <ReferenceReview
      key={`${params.context ?? 'creative'}:${params.branch ?? 'main'}`}
      contextId={params.context}
      branchId={params.branch}
    />
  );
}
