import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';
import { ActivityTableUnified } from '@/features/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import { AdminActivitySkeleton } from './loading';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export const runtime = 'nodejs';

async function ActivityContent() {
  const items = await getAdminActivityFeed(50);
  return (
    <PageContent noPadding>
      <ActivityTableUnified items={items} showHeader={false} />
    </PageContent>
  );
}

export default function AdminActivityPage() {
  return (
    <PageShell>
      <PageHeader
        title='Activity'
        description='Monitor recent operator actions and system outcomes.'
      />
      <Suspense fallback={<AdminActivitySkeleton />}>
        <ActivityContent />
      </Suspense>
    </PageShell>
  );
}
