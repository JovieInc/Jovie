import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ActivityTableUnified } from '@/components/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';
import { AdminActivitySkeleton } from './loading';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export const runtime = 'nodejs';

async function ActivityContent() {
  const items = await getAdminActivityFeed(50);
  return (
    <>
      <h1 className='sr-only'>Activity</h1>
      <ActivityTableUnified items={items} />
    </>
  );
}

export default function AdminActivityPage() {
  return (
    <Suspense fallback={<AdminActivitySkeleton />}>
      <ActivityContent />
    </Suspense>
  );
}
