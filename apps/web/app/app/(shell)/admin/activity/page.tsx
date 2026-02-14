import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ActivityTableUnified } from '@/components/admin/ActivityTableUnified';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import AdminActivityLoading from './loading';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export const runtime = 'nodejs';

async function ActivityContent() {
  const items = await getAdminActivityFeed(50);
  return (
    <PageContent noPadding>
      <h1 className='sr-only'>Activity</h1>
      <ActivityTableUnified items={items} />
    </PageContent>
  );
}

export default function AdminActivityPage() {
  return (
    <PageShell>
      <Suspense fallback={<AdminActivityLoading />}>
        <ActivityContent />
      </Suspense>
    </PageShell>
  );
}
