import type { Metadata } from 'next';

import { ActivityTable } from '@/components/admin/activity-table';

export const metadata: Metadata = {
  title: 'Admin activity',
};

export default function AdminActivityPage() {
  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Admin
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>Activity</h1>
        <p className='text-sm text-secondary-token'>
          Recent operational events and system activity for Jovie.
        </p>
      </header>

      <ActivityTable />
    </div>
  );
}
