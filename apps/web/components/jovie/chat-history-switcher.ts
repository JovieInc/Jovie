import { toSidebarThread } from '@/components/shell/SidebarThreadsSection';
import { APP_ROUTES } from '@/constants/routes';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import { formatTimeAgoCompact } from '@/lib/utils/date-formatting';

/** Breadcrumb label before a chat has a title. */
export const NEW_CHAT_LABEL = 'New Chat';
export const CHAT_HISTORY_SEARCH_PLACEHOLDER = 'Chat History';
export const CHAT_HISTORY_EMPTY = 'No Chats Yet';
export const CHAT_HISTORY_NO_MATCH = 'No Matching Chats';
export const CHAT_HISTORY_ERROR = "Couldn't Load Chats";

export interface ChatHistoryRow {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly age: string;
  readonly updatedAt: string;
  readonly unread: boolean;
  readonly active: boolean;
}

/**
 * Map conversations into switcher rows, newest first. A row is unread only
 * when this browser has a read baseline (the sidebar seeds one), so a first
 * visit never paints every row with a dot.
 */
export function buildChatHistoryRows(
  conversations: readonly ChatConversation[],
  {
    activeId,
    readAtById,
  }: {
    readonly activeId: string | null;
    readonly readAtById: Readonly<Record<string, string>>;
  }
): ChatHistoryRow[] {
  const hasReadBaseline = Object.keys(readAtById).length > 0;

  return [...conversations]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(conversation => {
      const thread = toSidebarThread(conversation, {
        activeThreadId: activeId,
        readAt: readAtById[conversation.id] ?? null,
      });

      return {
        id: thread.id,
        title: thread.title || COPY_FALLBACKS.conversation,
        href: thread.href ?? '',
        age: formatTimeAgoCompact(thread.updatedAt),
        updatedAt: thread.updatedAt,
        unread: hasReadBaseline && Boolean(thread.unread),
        active: thread.id === activeId,
      };
    });
}

/** Case-insensitive title match; every whitespace-separated term must appear. */
export function chatHistoryRowMatches(title: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = title.toLowerCase();
  return terms.every(term => haystack.includes(term));
}

export function getChatHistoryEmptyMessage({
  query,
  isError,
}: {
  readonly query: string;
  readonly isError: boolean;
}): string {
  if (isError) return CHAT_HISTORY_ERROR;
  return query.trim() ? CHAT_HISTORY_NO_MATCH : CHAT_HISTORY_EMPTY;
}

/**
 * Conversation id in a chat thread path (`/app/chat/{id}`), or null. A chat
 * created in place writes its id into the address bar without a Next.js
 * navigation, so the page's own prop can still be empty; the URL is the truth.
 */
export function getChatThreadIdFromPath(
  pathname: string | null | undefined
): string | null {
  const prefix = `${APP_ROUTES.CHAT}/`;
  if (!pathname?.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length).split('/')[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
