import type { Metadata } from 'next';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { AdminFeedbackTable } from '@/features/admin/feedback-table/AdminFeedbackTable';
import { getAdminFeedbackItems, getFeedbackCounts } from '@/lib/feedback';

export const metadata: Metadata = {
  title: 'Feedback | Admin',
};

export const runtime = 'nodejs';

export default async function AdminFeedbackPage() {
  const [items, _counts] = await Promise.all([
    getAdminFeedbackItems(200),
    getFeedbackCounts(),
  ]);

  return (
    <PageShell>
      <PageContent noPadding className='h-full'>
        <AdminFeedbackTable
          items={items.map(item => ({
            id: item.id,
            message: item.message,
            source: item.source,
            status: item.status,
            context: item.context,
            dismissedAtIso: item.dismissedAt?.toISOString() ?? null,
            createdAtIso: item.createdAt.toISOString(),
            user: item.user,
          }))}
        />
      </PageContent>
    </PageShell>
  );
}
