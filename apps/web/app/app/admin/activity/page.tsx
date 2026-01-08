import type { Metadata } from 'next';

import { ActivityTable } from '@/components/admin/ActivityTable';
import { getAdminActivityFeed } from '@/lib/admin/overview';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export default async function AdminActivityPage() {
  const items = await getAdminActivityFeed(50);

  return (
    <div className='space-y-8'>
      <header>
        <h1 className='sr-only'>Activity</h1>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Admin
        </p>
      </header>

      <ActivityTable items={items} />
    </div>
  );
}
