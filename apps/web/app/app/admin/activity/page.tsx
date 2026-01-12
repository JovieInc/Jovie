import type { Metadata } from 'next';

import { ActivityTableUnified } from '@/components/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export default async function AdminActivityPage() {
  const items = await getAdminActivityFeed(50);

  return (
    <div>
      <h1 className='sr-only'>Activity</h1>
      <ActivityTableUnified items={items} />
    </div>
  );
}
