'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageShell } from '@/components/organisms/PageShell';
import { JovieWorkFeed } from './JovieWorkFeed';

export function JovieWorkPanel() {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id;

  return (
    <PageShell data-testid='jovie-work-page'>
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex flex-col gap-4 px-3 py-2.5 sm:px-4 sm:py-3.5'>
          <div className='space-y-1'>
            <h1 className='text-lg font-medium tracking-tight text-primary-token'>
              Jovie Did This
            </h1>
            <p className='text-app text-secondary-token'>
              A read-only feed of autonomous work Jovie has shipped for you —
              workflows, approvals, retouch jobs, merch fulfillment, metadata
              submissions, and fan notifications.
            </p>
          </div>

          <ContentSurfaceCard className='p-4 sm:p-5'>
            {profileId ? (
              <JovieWorkFeed profileId={profileId} range='30d' />
            ) : (
              <p className='text-app text-secondary-token'>
                Select a profile to see Jovie&apos;s autonomous work.
              </p>
            )}
          </ContentSurfaceCard>
        </div>
      </div>
    </PageShell>
  );
}
