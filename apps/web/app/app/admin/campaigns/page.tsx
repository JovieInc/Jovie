import type { Metadata } from 'next';

import { InviteCampaignManager } from '@/components/admin/campaigns/InviteCampaignManager';
import { PageShell } from '@/components/organisms/PageShell';

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
