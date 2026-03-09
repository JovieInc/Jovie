'use client';

import { AlertCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';

function ProfilePageChatFallback() {
  return (
    <div className='flex h-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3 text-center max-w-sm'>
        <AlertCircle className='h-8 w-8 text-tertiary-token' />
        <p className='text-sm text-secondary-token'>
          Something went wrong loading chat. Please try again.
        </p>
        <button
          type='button'
          onClick={() => globalThis.location.reload()}
          className='flex items-center gap-2 rounded-md bg-surface-2 px-4 py-2 text-sm text-primary-token hover:bg-surface-3 transition-colors'
        >
          <RefreshCw className='h-4 w-4' />
          Reload
        </button>
      </div>
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
          <div className='flex flex-col items-center gap-3 text-center max-w-sm'>
            <AlertCircle className='h-8 w-8 text-tertiary-token' />
            <p className='text-sm text-secondary-token'>
              We hit a problem loading your profile. Please retry in a moment.
            </p>
            <button
              type='button'
              onClick={() => router.refresh()}
              className='flex items-center gap-2 rounded-md bg-surface-2 px-4 py-2 text-sm text-primary-token hover:bg-surface-3 transition-colors'
            >
              <RefreshCw className='h-4 w-4' />
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className='flex h-full flex-col'>
        {/* Empty message area skeleton */}
        <div className='flex flex-1 items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <MessageSquare className='h-8 w-8 text-tertiary-token opacity-40' />
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
