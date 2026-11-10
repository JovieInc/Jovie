'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { OvieHomeCanvas } from '@/components/features/admin/hud/OvieHomeCanvas';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import type { HomeCanvasState } from '@/components/jovie/types';
import { OVIE_APP_SHELL_WORKSPACE } from '@/lib/app-shell/workspaces';
import {
  DISCUSS_DECISION_PARAM,
  discussDecisionPrompt,
  parseDiscussCaseId,
} from '@/lib/ovie/discuss-decision';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';

/**
 * Operator (OV) chat surface (JOV-4810). Ovie dogfoods the canonical Jovie
 * shell, workspace surface, and chat component. Its typed differences are the
 * selected Summer agent, admin authorization, operator data scope, and the
 * company-loop Home canvas above the shared composer (JOV-5959).
 */
function renderOvieHomeCanvas(chat: HomeCanvasState) {
  return <OvieHomeCanvas chat={chat} />;
}

/**
 * `?discuss=<case id>` (a decision card's Discuss) opens a Summer conversation
 * about that decision. The prompt waits for the inbox so it can name the
 * decision; an unknown id still starts the conversation by id.
 */
function useDiscussPrompt(): string | undefined {
  const caseId = parseDiscussCaseId(
    useSearchParams().get(DISCUSS_DECISION_PARAM)
  );
  const inbox = useQuery<OvieInbox>({
    queryKey: ['ovie', 'inbox'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/ovie/inbox', {
        signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Inbox could not load.');
      return response.json();
    },
    ...FREQUENT_CACHE,
    enabled: caseId !== null,
  });
  if (!caseId || inbox.isPending) return undefined;
  return discussDecisionPrompt(
    caseId,
    inbox.data?.cases.find(entry => entry.id === caseId)
  );
}

export function OvChatClient() {
  const { selectedProfile, creatorProfiles } = useDashboardData();
  const activeProfile = selectedProfile ?? creatorProfiles[0] ?? null;
  const discussPrompt = useDiscussPrompt();

  return (
    <ChatWorkspaceSurface>
      <JovieChat
        ambientOwnedByShell
        profileId={activeProfile?.id}
        displayName={activeProfile?.displayName ?? undefined}
        avatarUrl={activeProfile?.avatarUrl}
        username={activeProfile?.username ?? undefined}
        chatMode={OVIE_APP_SHELL_WORKSPACE.chatMode}
        homeCanvas={renderOvieHomeCanvas}
        homeCanvasMode='living'
        initialQuery={discussPrompt}
      />
    </ChatWorkspaceSurface>
  );
}
