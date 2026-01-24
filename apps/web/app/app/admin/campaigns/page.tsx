import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { PageShell } from '@/components/organisms/PageShell';

const InviteCampaignManager = dynamic(
  () =>
    import('@/components/admin/campaigns/InviteCampaignManager').then(mod => ({
      default: mod.InviteCampaignManager,
    })),
  {
    loading: () => (
      <div className='space-y-4 animate-pulse'>
        <div className='h-10 w-48 rounded-md bg-surface-1' />
        <div className='h-64 w-full rounded-md bg-surface-1' />
        <div className='h-10 w-32 rounded-md bg-surface-1' />
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: 'Invite Campaigns - Admin',
};

export default function AdminCampaignsPage() {
  return (
    <PageShell>
      <div className='mx-auto max-w-4xl px-4 py-8'>
        <div className='mb-8'>
          <h1 className='text-2xl font-bold text-primary-token'>
            Invite Campaigns
          </h1>
          <p className='mt-2 text-sm text-secondary-token'>
            Send claim invites to unclaimed creator profiles. Emails are
            throttled and randomized to avoid spam filters.
          </p>
        </div>

        <InviteCampaignManager />
      </div>
    </PageShell>
  );
}
