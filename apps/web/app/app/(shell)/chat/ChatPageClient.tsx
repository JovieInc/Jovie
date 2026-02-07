'use client';

import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
  const [initialQueryHandled, setInitialQueryHandled] = useState(false);

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
  const rawQuery = searchParams.get('q');
  const initialQuery =
    !initialQueryHandled && !conversationId ? rawQuery : null;

  // Mark as handled after first render so re-renders don't re-submit
  useEffect(() => {
    if (rawQuery && !conversationId) {
      setInitialQueryHandled(true);
    }
  }, [rawQuery, conversationId]);

  // Show loading state until profile is available to avoid sending undefined profileId
  if (!selectedProfile) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-secondary-token' />
      </div>
    );
  }

  return (
    <JovieChat
      profileId={selectedProfile.id}
      conversationId={conversationId}
      onConversationCreate={handleConversationCreate}
      initialQuery={initialQuery ?? undefined}
    />
  );
}
