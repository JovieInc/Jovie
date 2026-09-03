'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { OVIE_APP_SHELL_WORKSPACE } from '@/lib/app-shell/workspaces';

/**
 * Operator (OV) chat surface (JOV-4810). Ovie dogfoods the canonical Jovie
 * shell, workspace surface, and chat component. Its typed differences are the
 * selected Summer agent, admin authorization, operator data scope, and
 * capability-derived navigation; it does not own parallel chat presentation.
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
        chatMode={OVIE_APP_SHELL_WORKSPACE.chatMode}
      />
    </ChatWorkspaceSurface>
  );
}
