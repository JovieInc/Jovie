'use client';

import {
  CommonDropdown,
  type CommonDropdownItem,
  type CommonDropdownProps,
  MENU_MOTION_ANCHORED,
  MENU_SCROLL_BODY,
  TitleMenuTrigger,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  readThreadReadState,
  writeThreadReadState,
} from '@/components/shell/SidebarThreadsSection';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import {
  buildChatHistoryRows,
  CHAT_HISTORY_ERROR,
  CHAT_HISTORY_SEARCH_PLACEHOLDER,
  type ChatHistoryRow,
  chatHistoryRowMatches,
  getChatHistoryEmptyMessage,
  getChatThreadIdFromPath,
  NEW_CHAT_LABEL,
} from './chat-history-switcher';

export interface ChatHistorySwitcherProps {
  /** Current chat title; null renders "New Chat". */
  readonly title: string | null;
  /** Current conversation id, used to mark its row selected. */
  readonly activeConversationId: string | null;
  /**
   * Radix menu modality. Default `true` (production behavior). Stories pass
   * `false`: a modal Radix menu `hideOthers`-ARIA-hides the story canvas
   * around the portaled content, which fails axe aria-hidden-focus on the
   * focusable trigger. Non-modal is visually identical for demos.
   */
  readonly modal?: boolean;
}

const MAX_LIST_HEIGHT = 'min(30rem, calc(100dvh - 6rem))';

const matchTitle: NonNullable<CommonDropdownProps['filterItem']> = (
  item,
  query
) =>
  'label' in item && typeof item.label === 'string'
    ? chatHistoryRowMatches(item.label, query)
    : true;

// The load-error panel (message + Retry) must survive a typed search.
const keepEveryItem: NonNullable<CommonDropdownProps['filterItem']> = () =>
  true;

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
      {/* A real space between the title and the age: the two spans sit in a
          flex row, so the whitespace text node never becomes a flex item and
          the layout is unchanged — but the item's textContent now separates
          the age's words from the title's. axe tokenizes the visible text
          and the accessible name into words (Intl.Segmenter, UAX #29 keeps
          "Plan6m" a single word) and requires the visible words inside the
          name; a glued "Plan6m" can never be found in the spaced aria-label
          (label-content-name-mismatch, WCAG 2.5.3). */}{' '}
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
  modal = true,
}: ChatHistorySwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [readAtById, setReadAtById] = useState<Record<string, string>>({});
  // A chat started in place updates the URL without a navigation, so the
  // prop can lag behind; read the id from the address bar when the menu opens.
  const [urlConversationId, setUrlConversationId] = useState<string | null>(
    null
  );
  const activeId = activeConversationId ?? urlConversationId;
  // Fetch on first intent (hover, focus or open), not on every chat render;
  // the sidebar usually has this cached already under the same key.
  const [hasIntent, setHasIntent] = useState(false);
  const markIntent = useCallback(() => setHasIntent(true), []);

  const {
    data: conversations,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useChatConversationsQuery({ limit: 50, enabled: hasIntent || open });

  // An open chat whose title hasn't been generated yet uses the same name as
  // its row in the list; only a chat that doesn't exist yet is "New Chat".
  const label =
    title?.trim() ||
    (activeConversationId ? COPY_FALLBACKS.conversation : NEW_CHAT_LABEL);
  // Offline with nothing cached, the query pauses instead of failing; show
  // the load error and Retry rather than an empty "No Chats Yet".
  const showError = (isError || isPaused) && !conversations;

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    // Read state is browser-only; read it when the panel opens, not on render.
    if (nextOpen) {
      setHasIntent(true);
      setReadAtById(readThreadReadState());
      setUrlConversationId(
        getChatThreadIdFromPath(globalThis.location?.pathname)
      );
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
    if (showError) {
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
      activeId,
      readAtById,
    }).map(row => ({
      id: row.id,
      type: 'action' as const,
      // The custom row content shows the title and the age, so the
      // accessible name carries both: an aria-label of the title alone
      // leaves the visible age outside the name (axe
      // label-content-name-mismatch, WCAG 2.5.3 Label in Name).
      label: `${row.title} ${row.age}`,
      selected: row.active,
      content: <ChatHistoryRowContent row={row} />,
      onClick: () => handleSelect(row),
    }));
  }, [activeId, conversations, handleSelect, readAtById, showError, refetch]);

  return (
    <CommonDropdown
      items={items}
      open={open}
      onOpenChange={handleOpenChange}
      modal={modal}
      align='start'
      sideOffset={6}
      searchable
      searchPlaceholder={CHAT_HISTORY_SEARCH_PLACEHOLDER}
      onSearchChange={setQuery}
      filterItem={showError ? keepEveryItem : matchTitle}
      isLoading={isLoading && !conversations}
      emptyMessage={getChatHistoryEmptyMessage({ query, isError: showError })}
      scrollBody={MENU_SCROLL_BODY}
      motion={MENU_MOTION_ANCHORED}
      maxHeight={MAX_LIST_HEIGHT}
      trigger={
        // The header title truncates (overflow hidden), so the atom keeps
        // the pill inside its box and draws the focus ring inset.
        <TitleMenuTrigger
          label={label}
          data-testid='chat-history-trigger'
          title={label}
          onPointerEnter={markIntent}
          onFocus={markIntent}
        />
      }
    />
  );
}
