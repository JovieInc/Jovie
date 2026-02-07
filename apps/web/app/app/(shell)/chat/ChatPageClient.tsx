'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieChat } from '@/components/jovie/JovieChat';
import { APP_ROUTES } from '@/constants/routes';

interface ChatPageClientProps {
  readonly conversationId?: string;
}

export function ChatPageClient({ conversationId }: ChatPageClientProps) {
  const { selectedProfile } = useDashboardData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQueryHandled = useRef(false);

  const handleConversationCreate = useCallback(
    (newConversationId: string) => {
      router.replace(`${APP_ROUTES.CHAT}/${newConversationId}`, {
        scroll: false,
      });
    },
    [router]
  );

  // Pick up ?q= param (e.g. from profile page chat fallback) and pre-fill the input.
  // We pass it as initialQuery so JovieChat can auto-submit it.
  const initialQuery =
    !initialQueryHandled.current && !conversationId
      ? searchParams.get('q')
      : null;

  // Mark as handled after first render so re-renders don't re-submit
  useEffect(() => {
    if (initialQuery) {
      initialQueryHandled.current = true;
    }
  }, [initialQuery]);

  return (
    <JovieChat
      profileId={selectedProfile?.id}
      conversationId={conversationId}
      onConversationCreate={handleConversationCreate}
      initialQuery={initialQuery ?? undefined}
    />
  );
}
