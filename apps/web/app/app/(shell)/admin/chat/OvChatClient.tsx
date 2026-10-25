'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { OvieHomeCanvas } from '@/components/features/admin/hud/OvieHomeCanvas';
import {
  type OvieFullscreenState,
  useOvieFullscreen,
} from '@/components/features/admin/hud/useOvieFullscreen';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import type { HomeCanvasState } from '@/components/jovie/types';
import { OVIE_APP_SHELL_WORKSPACE } from '@/lib/app-shell/workspaces';

/**
 * Operator (OV) chat surface (JOV-4810). Ovie dogfoods the canonical Jovie
 * shell, workspace surface, and chat component. Its typed differences are the
 * selected Summer agent, admin authorization, operator data scope, and the
 * company-loop Home canvas above the shared composer (JOV-5959).
 */
function renderOvieHomeCanvas(
  chat: HomeCanvasState,
  fullscreen: OvieFullscreenState
) {
  return <OvieHomeCanvas chat={chat} fullscreen={fullscreen} />;
}

export function OvChatClient() {
  const { selectedProfile, creatorProfiles } = useDashboardData();
  const activeProfile = selectedProfile ?? creatorProfiles[0] ?? null;
  // Owned here, above the chat, so Full Screen survives HUD <-> thread swaps.
  const fullscreen = useOvieFullscreen();

  return (
    <ChatWorkspaceSurface>
      <JovieChat
        profileId={activeProfile?.id}
        displayName={activeProfile?.displayName ?? undefined}
        avatarUrl={activeProfile?.avatarUrl}
        username={activeProfile?.username ?? undefined}
        chatMode={OVIE_APP_SHELL_WORKSPACE.chatMode}
        homeCanvas={chat => renderOvieHomeCanvas(chat, fullscreen)}
        homeCanvasMode='living'
      />
    </ChatWorkspaceSurface>
  );
}
