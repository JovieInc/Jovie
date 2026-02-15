'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Copy, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { JovieChat } from '@/components/jovie/JovieChat';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useNotifications } from '@/lib/hooks/useNotifications';

interface ChatPageClientProps {
  readonly conversationId?: string;
}

/**
 * Header badge that displays the conversation title as a subtle breadcrumb suffix.
 * Rendered inside the DashboardHeader via HeaderActionsContext.
 */
function ChatTitleBadge({ title }: { readonly title: string }) {
  return (
    <span className='flex items-center gap-1.5 text-[13px] text-tertiary-token'>
      <span aria-hidden='true'>/</span>
      <span className='max-w-[200px] truncate'>{title}</span>
    </span>
  );
}

export function ChatPageClient({ conversationId }: ChatPageClientProps) {
  const { selectedProfile } = useDashboardData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notifications = useNotifications();
  const [initialQueryHandled, setInitialQueryHandled] = useState(false);
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();

  const handleCopyConversationId = useCallback(async () => {
    if (!conversationId) {
      notifications.error(
        'Session ID is only available after your first message.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(conversationId);
      notifications.success('Session ID copied');
    } catch {
      notifications.error('Could not copy session ID');
    }
  }, [conversationId, notifications]);

  const headerActions = useMemo(
    () =>
      conversationId ? (
        <SimpleTooltip content='Copy session ID'>
          <CircleIconButton
            size='sm'
            variant='outline'
            ariaLabel='Copy session ID'
            onClick={() => {
              handleCopyConversationId();
            }}
          >
            <Copy aria-hidden='true' className='size-4' />
          </CircleIconButton>
        </SimpleTooltip>
      ) : null,
    [conversationId, handleCopyConversationId]
  );

  const handleConversationCreate = useCallback(
    (newConversationId: string) => {
      router.replace(`${APP_ROUTES.CHAT}/${newConversationId}`, {
        scroll: false,
      });
    },
    [router]
  );

  // Update the header badge when the conversation title changes
  const handleTitleChange = useCallback(
    (title: string | null) => {
      if (title) {
        setHeaderBadge(<ChatTitleBadge title={title} />);
      } else {
        setHeaderBadge(null);
      }
    },
    [setHeaderBadge]
  );

  // Clean up header badge when leaving the chat page
  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderBadge, setHeaderActions]);

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
      onTitleChange={handleTitleChange}
      initialQuery={initialQuery ?? undefined}
      displayName={selectedProfile.displayName ?? undefined}
      avatarUrl={selectedProfile.avatarUrl}
    />
  );
}
