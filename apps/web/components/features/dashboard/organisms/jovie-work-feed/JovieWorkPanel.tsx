'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import { JovieWorkFeed } from './JovieWorkFeed';

export function JovieWorkPanelView({
  profileId,
}: Readonly<{ profileId?: string }>) {
  return (
    <PageShell data-testid='jovie-work-page'>
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex min-h-full flex-col gap-4'>
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

          {profileId ? (
            <JovieWorkFeed
              profileId={profileId}
              range='30d'
              showHeader={false}
            />
          ) : (
            <EmptyState
              heading="Select a profile to see Jovie's autonomous work."
              presentation='workspace'
              testId='jovie-work-profile-empty-state'
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}

export function JovieWorkPanel() {
  const { selectedProfile } = useDashboardData();

  return <JovieWorkPanelView profileId={selectedProfile?.id} />;
}
