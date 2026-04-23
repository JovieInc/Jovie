'use client';

import { AlertCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';

function ProfilePageChatFallback() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full items-center justify-center p-6'>
        <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
          <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-surface-0'>
            <AlertCircle className='h-5 w-5 text-tertiary-token' />
          </div>
          <p className='text-sm text-secondary-token'>
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
    </ChatWorkspaceSurface>
  );
}

function ProfilePageChatInner() {
  const { selectedProfile, dashboardLoadError } = useDashboardData();
  const router = useRouter();

  if (!selectedProfile) {
    const hasDashboardLoadFailure = Boolean(dashboardLoadError);

    if (hasDashboardLoadFailure) {
      return (
        <ChatWorkspaceSurface>
          <div className='flex h-full items-center justify-center p-6'>
            <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
              <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-surface-0'>
                <AlertCircle className='h-5 w-5 text-tertiary-token' />
              </div>
              <p className='text-sm text-secondary-token'>
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
        </ChatWorkspaceSurface>
      );
    }

    return (
      <ChatWorkspaceSurface>
        <div className='flex h-full flex-col'>
          <div className='flex flex-1 items-center justify-center'>
            <div className='flex flex-col items-center gap-3'>
              <MessageSquare className='h-8 w-8 text-tertiary-token opacity-40' />
              <div className='h-4 w-32 rounded skeleton' />
            </div>
          </div>
          <div className='shrink-0 px-4 py-4'>
            <ContentSurfaceCard className='mx-auto max-w-2xl p-3'>
              <div className='h-10 rounded-2xl skeleton' />
            </ContentSurfaceCard>
          </div>
        </div>
      </ChatWorkspaceSurface>
    );
  }

  return (
    <ChatWorkspaceSurface>
      <JovieChat
        profileId={selectedProfile.id}
        displayName={selectedProfile.displayName ?? undefined}
        avatarUrl={selectedProfile.avatarUrl}
        username={selectedProfile.username ?? undefined}
      />
    </ChatWorkspaceSurface>
  );
}

function ProfilePageChatSkeleton() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full flex-col'>
        <div className='flex flex-1 items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <MessageSquare className='h-8 w-8 text-tertiary-token opacity-40' />
            <div className='h-4 w-32 rounded skeleton' />
          </div>
        </div>
        <div className='shrink-0 px-4 py-4'>
          <ContentSurfaceCard className='mx-auto max-w-2xl p-3'>
            <div className='h-10 rounded-2xl skeleton' />
          </ContentSurfaceCard>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}

export function ProfilePageChat() {
  return (
    <ErrorBoundary fallback={<ProfilePageChatFallback />}>
      <Suspense fallback={<ProfilePageChatSkeleton />}>
        <ProfilePageChatInner />
      </Suspense>
    </ErrorBoundary>
  );
}
