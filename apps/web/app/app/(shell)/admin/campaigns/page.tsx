import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
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
        <ContentSurfaceCard className='overflow-hidden' aria-hidden='true'>
          <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
            <LoadingSkeleton height='h-5' width='w-40' rounded='md' />
            <LoadingSkeleton
              height='h-4'
              width='w-72'
              rounded='md'
              className='mt-2'
            />
          </div>
        </ContentSurfaceCard>
        <ContentSurfaceCard
          className='min-h-[256px] overflow-hidden'
          aria-hidden='true'
        >
          <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
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
          </div>
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
        <ContentSurfaceCard className='mb-4 overflow-hidden'>
          <ContentSectionHeader
            title='Invite campaigns'
            subtitle='Send claim invites to unclaimed creator profiles with throttled delivery and preview-first review.'
            className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          />
        </ContentSurfaceCard>

        <InviteCampaignManager />
      </PageContent>
    </PageShell>
  );
}
