'use client';

import {
  CommonDropdown,
  type CommonDropdownItem,
  type CommonDropdownProps,
} from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  readThreadReadState,
  writeThreadReadState,
} from '@/components/shell/SidebarThreadsSection';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { cn } from '@/lib/utils';
import {
  buildChatHistoryRows,
  CHAT_HISTORY_ERROR,
  CHAT_HISTORY_SEARCH_PLACEHOLDER,
  type ChatHistoryRow,
  chatHistoryRowMatches,
  getChatHistoryEmptyMessage,
  NEW_CHAT_LABEL,
} from './chat-history-switcher';

export interface ChatHistorySwitcherProps {
  /** Current chat title; null renders "New Chat". */
  readonly title: string | null;
  /** Current conversation id, used to mark its row selected. */
  readonly activeConversationId: string | null;
}

// The trigger keeps the old title's left seam: the pill's inset padding is
// pulled back with a matching negative margin, so opening never moves text.
const TRIGGER_CLASS = cn(
  '-mx-1.5 inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-lg px-1.5',
  'text-primary-token',
  'transition-colors duration-subtle ease-subtle',
  'hover:bg-surface-1 aria-expanded:bg-surface-1',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/35'
);

const MAX_LIST_HEIGHT = 'min(30rem, calc(100dvh - 6rem))';

const matchTitle: NonNullable<CommonDropdownProps['filterItem']> = (
  item,
  query
) =>
  'label' in item && typeof item.label === 'string'
    ? chatHistoryRowMatches(item.label, query)
    : true;

function ChatHistoryRowContent({ row }: { readonly row: ChatHistoryRow }) {
  return (
    <span
      className='flex min-w-0 flex-1 items-center gap-2'
      data-testid='chat-history-row'
      data-unread={row.unread ? 'true' : undefined}
    >
      <span
        aria-hidden='true'
        className='flex w-2 shrink-0 items-center justify-center'
      >
        {row.unread ? (
          <span className='size-1.5 rounded-full bg-accent' />
        ) : null}
      </span>
      <span className='min-w-0 flex-1 truncate'>{row.title}</span>
      <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
        {row.age}
      </span>
    </span>
  );
}

/**
 * Chat title in the app header that opens chat history: search pinned on
 * top (type anywhere to filter), newest chats below with an unread dot and a
 * compact age, and a list that fades at whichever edge still has rows.
 * Built on the shared CommonDropdown so focus, Escape, outside click and
 * arrow-key roving match every other Jovie menu.
 */
export function ChatHistorySwitcher({
  title,
  activeConversationId,
}: ChatHistorySwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [readAtById, setReadAtById] = useState<Record<string, string>>({});
  // Fetch on first intent (hover, focus or open), not on every chat render;
  // the sidebar usually has this cached already under the same key.
  const [hasIntent, setHasIntent] = useState(false);
  const markIntent = useCallback(() => setHasIntent(true), []);

  const {
    data: conversations,
    isLoading,
    isError,
    refetch,
  } = useChatConversationsQuery({ limit: 50, enabled: hasIntent || open });

  const label = title?.trim() || NEW_CHAT_LABEL;

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    // Read state is browser-only; read it when the panel opens, not on render.
    if (nextOpen) {
      setHasIntent(true);
      setReadAtById(readThreadReadState());
    }
    setOpen(nextOpen);
  }, []);

  const handleSelect = useCallback(
    (row: ChatHistoryRow) => {
      const current = readThreadReadState();
      if (Object.keys(current).length > 0) {
        writeThreadReadState({ ...current, [row.id]: row.updatedAt });
      }
      if (!row.active) router.push(row.href);
    },
    [router]
  );

  const items = useMemo<CommonDropdownItem[]>(() => {
    if (isError && !conversations) {
      return [
        {
          id: 'chat-history-error',
          type: 'label',
          label: CHAT_HISTORY_ERROR,
        },
        {
          id: 'chat-history-retry',
          type: 'action',
          label: 'Retry',
          closeOnSelect: false,
          onClick: () => {
            void refetch();
          },
        },
      ];
    }

    return buildChatHistoryRows(conversations ?? [], {
      activeId: activeConversationId,
      readAtById,
    }).map(row => ({
      id: row.id,
      type: 'action' as const,
      label: row.title,
      selected: row.active,
      content: <ChatHistoryRowContent row={row} />,
      onClick: () => handleSelect(row),
    }));
  }, [
    activeConversationId,
    conversations,
    handleSelect,
    isError,
    readAtById,
    refetch,
  ]);

  return (
    <CommonDropdown
      items={items}
      open={open}
      onOpenChange={handleOpenChange}
      align='start'
      sideOffset={6}
      searchable
      searchPlaceholder={CHAT_HISTORY_SEARCH_PLACEHOLDER}
      onSearchChange={setQuery}
      filterItem={matchTitle}
      isLoading={isLoading && !conversations}
      emptyMessage={getChatHistoryEmptyMessage({ query, isError: false })}
      scrollBody
      motion='anchored'
      maxHeight={MAX_LIST_HEIGHT}
      trigger={
        <button
          type='button'
          className={TRIGGER_CLASS}
          data-testid='chat-history-trigger'
          title={label}
          onPointerEnter={markIntent}
          onFocus={markIntent}
        >
          <span className='min-w-0 truncate'>{label}</span>
          <ChevronDown
            aria-hidden='true'
            className='size-3.5 shrink-0 text-tertiary-token'
          />
        </button>
      }
    />
  );
}
