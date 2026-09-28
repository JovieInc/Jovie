'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { OVIE_APP_SHELL_WORKSPACE } from '@/lib/app-shell/workspaces';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';

/**
 * Operator (OV) chat surface (JOV-4810). Ovie dogfoods the canonical Jovie
 * shell, workspace surface, and chat component. Its typed differences are the
 * selected Summer agent, admin authorization, operator data scope, and
 * capability-derived navigation; it does not own parallel chat presentation.
 */
export function OvChatClient({
  homeBriefing,
}: {
  readonly homeBriefing: OvieHomeBriefing;
}) {
  const { selectedProfile, creatorProfiles } = useDashboardData();
  const activeProfile = selectedProfile ?? creatorProfiles[0] ?? null;

  return (
    <ChatWorkspaceSurface>
      <JovieChat
        profileId={activeProfile?.id}
        displayName={activeProfile?.displayName ?? undefined}
        avatarUrl={activeProfile?.avatarUrl}
        username={activeProfile?.username ?? undefined}
        chatMode={OVIE_APP_SHELL_WORKSPACE.chatMode}
        ovieHomeBriefing={homeBriefing}
      />
    </ChatWorkspaceSurface>
  );
}
