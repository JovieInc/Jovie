import type { Metadata } from 'next';

import { AdminFeedbackTable } from '@/components/admin/feedback-table/AdminFeedbackTable';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminFeedbackItems, getFeedbackCounts } from '@/lib/feedback';

export const metadata: Metadata = {
  title: 'Feedback | Admin',
};

export const runtime = 'nodejs';

export default async function AdminFeedbackPage() {
  const [items, counts] = await Promise.all([
    getAdminFeedbackItems(200),
    getFeedbackCounts(),
  ]);

  return (
    <PageShell>
      <PageContent noPadding>
        <div className='px-6 pt-6 pb-2'>
          <h1 className='text-2xl font-semibold text-primary-token'>
            Feedback inbox
          </h1>
          <p className='mt-1 text-sm text-secondary-token'>
            {counts.pending} pending · {counts.dismissed} dismissed ·{' '}
            {counts.total} total
          </p>
        </div>
        <div className='p-6 pt-4'>
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
        </div>
      </PageContent>
    </PageShell>
  );
}
