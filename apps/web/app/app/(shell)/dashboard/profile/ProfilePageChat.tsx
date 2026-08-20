'use client';

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';

function ProfilePageChatFallback() {
  const router = useRouter();

  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full items-center justify-center p-6'>
        <PageErrorState
          title="Conversation couldn't load"
          message='Something went wrong loading the conversation. Please try again.'
          actionLabel='Reload'
          actionAriaLabel='Reload Chat'
          onRetry={() => router.refresh()}
          extraContext={{ Context: 'Profile Chat' }}
        />
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
            <PageErrorState
              title="Profile couldn't load"
              message='We hit a problem loading your profile. Please retry in a moment.'
              actionLabel={RECOVERY_COPY.retryLabel}
              actionAriaLabel='Retry Loading Profile Chat'
              onRetry={() => router.refresh()}
              extraContext={{ Context: 'Profile Chat' }}
            />
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
