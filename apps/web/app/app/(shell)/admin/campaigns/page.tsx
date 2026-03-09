import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { PageContent, PageShell } from '@/components/organisms/PageShell';

const InviteCampaignManager = dynamic(
  () =>
    import('@/components/admin/campaigns/InviteCampaignManager').then(mod => ({
      default: mod.InviteCampaignManager,
    })),
  {
    loading: () => (
      <div className='space-y-4 animate-pulse'>
        <div className='h-10 w-48 rounded-md skeleton' />
        <div className='h-64 w-full rounded-md skeleton' />
        <div className='h-10 w-32 rounded-md skeleton' />
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: 'Invite Campaigns - Admin',
};

export const runtime = 'nodejs';

export default function AdminCampaignsPage() {
  return (
    <PageShell>
      <PageContent>
        <div className='mb-6'>
          <p className='text-sm text-secondary-token'>
            Send claim invites to unclaimed creator profiles. Emails are
            throttled and randomized to avoid spam filters.
          </p>
        </div>

        <InviteCampaignManager />
      </PageContent>
    </PageShell>
  );
}
