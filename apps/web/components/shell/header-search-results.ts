import { APP_ROUTES } from '@/constants/routes';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';

export type HeaderSearchGroupKind = 'threads' | 'entities' | 'library-assets';

export interface HeaderSearchResultItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

export interface HeaderSearchResultGroup {
  readonly kind: HeaderSearchGroupKind;
  readonly label: string;
  readonly items: readonly HeaderSearchResultItem[];
}

interface SearchableProfile {
  readonly id: string;
  readonly displayName: string | null;
  readonly username: string;
  readonly usernameNormalized: string;
}

export interface SearchableRelease {
  readonly id: string;
  readonly title: string;
  readonly artistNames?: readonly string[];
  readonly smartLinkPath: string;
}

export interface HeaderSearchCatalog {
  readonly conversations: readonly ChatConversation[];
  readonly profiles: readonly SearchableProfile[];
  readonly releases: readonly SearchableRelease[];
}

const RESULT_LIMIT_PER_GROUP = 5;

function includesQuery(
  query: string,
  ...values: Array<string | null>
): boolean {
  return values.some(value => value?.toLowerCase().includes(query));
}

export function buildHeaderSearchGroups(
  rawQuery: string,
  catalog: HeaderSearchCatalog
): HeaderSearchResultGroup[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const groups: HeaderSearchResultGroup[] = [];
  const threads = catalog.conversations
    .filter(conversation =>
      includesQuery(query, conversation.title ?? 'Untitled chat')
    )
    .slice(0, RESULT_LIMIT_PER_GROUP)
    .map(conversation => ({
      id: `thread:${conversation.id}`,
      label: conversation.title?.trim() || 'Untitled chat',
      description: 'Chat thread',
      href: `${APP_ROUTES.CHAT}/${encodeURIComponent(conversation.id)}`,
    }));
  if (threads.length > 0) {
    groups.push({ kind: 'threads', label: 'Threads', items: threads });
  }

  const entities = catalog.profiles
    .filter(profile =>
      includesQuery(
        query,
        profile.displayName,
        profile.username,
        profile.usernameNormalized
      )
    )
    .slice(0, RESULT_LIMIT_PER_GROUP)
    .map(profile => ({
      id: `profile:${profile.id}`,
      label: profile.displayName?.trim() || profile.username,
      description: `@${profile.usernameNormalized}`,
      href: `/${encodeURIComponent(profile.usernameNormalized)}`,
    }));
  if (entities.length > 0) {
    groups.push({ kind: 'entities', label: 'Entities', items: entities });
  }

  const libraryAssets = catalog.releases
    .filter(release =>
      includesQuery(query, release.title, ...(release.artistNames ?? []))
    )
    .slice(0, RESULT_LIMIT_PER_GROUP)
    .map(release => ({
      id: `library:${release.id}`,
      label: release.title,
      description: release.artistNames?.join(', ') || 'Library release',
      href: release.smartLinkPath,
    }));
  if (libraryAssets.length > 0) {
    groups.push({
      kind: 'library-assets',
      label: 'Library Assets',
      items: libraryAssets,
    });
  }

  return groups;
}
