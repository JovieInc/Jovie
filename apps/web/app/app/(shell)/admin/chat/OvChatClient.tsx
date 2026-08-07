'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

/**
 * Operator (OV) chat surface (JOV-4810). Deliberately much simpler than the
 * customer ChatPageClient: no preview panels, no onboarding welcome-chat
 * bootstrap, no header actions, and no conversation-route navigation — the
 * URL stays on /app/ov/chat while JovieChat tracks the active conversation
 * internally. Voice dictation and playback interruption ship inside the
 * JovieChat composer (ChatInput), so no extra wiring is needed here.
 */
export function OvChatClient() {
  const { selectedProfile, creatorProfiles } = useDashboardData();
  const activeProfile = selectedProfile ?? creatorProfiles[0] ?? null;

  if (!activeProfile) {
    return (
      <ChatWorkspaceSurface>
        <div className='flex h-full items-center justify-center p-6'>
          <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
            <p className='text-sm font-medium text-secondary-token'>
              OV chat needs an artist profile
            </p>
            <p className='text-sm text-tertiary-token'>
              The signed-in account has no artist profile. Operator chat runs on
              an artist profile, so add one to this account to use it.
            </p>
          </ContentSurfaceCard>
        </div>
      </ChatWorkspaceSurface>
    );
  }

  return (
    <ChatWorkspaceSurface>
      <JovieChat
        profileId={activeProfile.id}
        displayName={activeProfile.displayName ?? undefined}
        avatarUrl={activeProfile.avatarUrl}
        username={activeProfile.username ?? undefined}
        chatMode='ov'
      />
    </ChatWorkspaceSurface>
  );
}
