import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

const InviteCampaignManager = dynamic(
  () =>
    import('@/features/admin/campaigns/InviteCampaignManager').then(mod => ({
      default: mod.InviteCampaignManager,
    })),
  {
    loading: () => (
      <div className='space-y-4'>
        <ContentSurfaceCard className='p-4 sm:p-6' aria-hidden='true'>
          <LoadingSkeleton height='h-5' width='w-40' rounded='md' />
          <LoadingSkeleton
            height='h-4'
            width='w-72'
            rounded='md'
            className='mt-2'
          />
        </ContentSurfaceCard>
        <ContentSurfaceCard
          className='min-h-[256px] p-4 sm:p-6'
          aria-hidden='true'
        >
          <LoadingSkeleton height='h-10' width='w-48' rounded='md' />
          <LoadingSkeleton
            height='h-64'
            width='w-full'
            rounded='lg'
            className='mt-4'
          />
          <LoadingSkeleton
            height='h-9'
            width='w-32'
            rounded='md'
            className='mt-4'
          />
        </ContentSurfaceCard>
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
        <ContentSurfaceCard className='mb-6 p-4 sm:p-5'>
          <p className='text-sm text-(--linear-text-secondary)'>
            Send claim invites to unclaimed creator profiles. Emails are
            throttled and randomized to avoid spam filters.
          </p>
        </ContentSurfaceCard>

        <InviteCampaignManager />
      </PageContent>
    </PageShell>
  );
}
