'use client';

import { AlertCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';

function ProfilePageChatFallback() {
  return (
    <div className='flex h-full items-center justify-center'>
      <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
        <div className='flex h-10 w-10 items-center justify-center rounded-[12px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
          <AlertCircle className='h-5 w-5 text-(--linear-text-tertiary)' />
        </div>
        <p className='text-sm text-(--linear-text-secondary)'>
          Something went wrong loading chat. Please try again.
        </p>
        <DashboardHeaderActionButton
          ariaLabel='Reload chat'
          onClick={() => globalThis.location.reload()}
          icon={<RefreshCw className='h-4 w-4' />}
          label='Reload'
        />
      </ContentSurfaceCard>
    </div>
  );
}

function ProfilePageChatInner() {
  const { selectedProfile, dashboardLoadError } = useDashboardData();
  const router = useRouter();

  if (!selectedProfile) {
    const hasDashboardLoadFailure = Boolean(dashboardLoadError);

    if (hasDashboardLoadFailure) {
      return (
        <div className='flex h-full items-center justify-center'>
          <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
            <div className='flex h-10 w-10 items-center justify-center rounded-[12px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
              <AlertCircle className='h-5 w-5 text-(--linear-text-tertiary)' />
            </div>
            <p className='text-sm text-(--linear-text-secondary)'>
              We hit a problem loading your profile. Please retry in a moment.
            </p>
            <DashboardHeaderActionButton
              ariaLabel='Retry loading profile chat'
              onClick={() => router.refresh()}
              icon={<RefreshCw className='h-4 w-4' />}
              label='Retry'
            />
          </ContentSurfaceCard>
        </div>
      );
    }

    return (
      <div className='flex h-full flex-col'>
        {/* Empty message area skeleton */}
        <div className='flex flex-1 items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <MessageSquare className='h-8 w-8 text-(--linear-text-tertiary) opacity-40' />
            <div className='h-4 w-32 rounded skeleton' />
          </div>
        </div>
        {/* Input bar skeleton */}
        <div className='shrink-0 p-4'>
          <div className='h-10 rounded-lg skeleton' />
        </div>
      </div>
    );
  }

  return (
    <JovieChat
      profileId={selectedProfile.id}
      displayName={selectedProfile.displayName ?? undefined}
      avatarUrl={selectedProfile.avatarUrl}
      username={selectedProfile.username ?? undefined}
    />
  );
}

export function ProfilePageChat() {
  return (
    <ErrorBoundary fallback={<ProfilePageChatFallback />}>
      <ProfilePageChatInner />
    </ErrorBoundary>
  );
}
