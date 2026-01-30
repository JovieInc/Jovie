import type { Metadata } from 'next';

import { ActivityTableUnified } from '@/components/admin/ActivityTableUnified';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminActivityFeed } from '@/lib/admin/overview';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export const runtime = 'nodejs';

export default async function AdminActivityPage() {
  const items = await getAdminActivityFeed(50);

  return (
    <PageShell>
      <PageContent noPadding>
        <h1 className='sr-only'>Activity</h1>
        <ActivityTableUnified items={items} />
      </PageContent>
    </PageShell>
  );
}
