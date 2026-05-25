'use client';

import { Button } from '@jovie/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { PageHeader, PageShell } from '@/components/organisms/PageShell';
import {
  readThreadReadState,
  type SidebarThread,
  SidebarThreadRow,
  toSidebarThread,
  writeThreadReadState,
} from '@/components/shell/SidebarThreadsSection';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';

const THREAD_LIMIT = 50;

function ThreadListSkeleton() {
  const skeletonRows = ['a', 'b', 'c', 'd', 'e', 'f'];

  return (
    <div className='space-y-1.5'>
      {skeletonRows.map(rowId => (
        <div
          key={`thread-skeleton-${rowId}`}
          className='flex h-7 items-center gap-2 rounded-full px-2.5'
        >
          <div className='h-1.5 w-1.5 shrink-0 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-3.5 w-full max-w-[18rem] rounded-sm skeleton motion-reduce:animate-none' />
        </div>
      ))}
    </div>
  );
}

export function ThreadsPageClient() {
  const [query, setQuery] = useState('');
  const [threadReadAtById, setThreadReadAtById] =
    useState<Record<string, string>>(readThreadReadState);

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = useChatConversationsQuery({
    limit: THREAD_LIMIT,
  });

  useEffect(() => {
    if (!conversations || conversations.length === 0) return;

    setThreadReadAtById(previous => {
      if (Object.keys(previous).length > 0) return previous;

      const baseline = Object.fromEntries(
        conversations.map(conversation => [
          conversation.id,
          conversation.updatedAt,
        ])
      );
      writeThreadReadState(baseline);
      return baseline;
    });
  }, [conversations]);

  const sidebarThreads = useMemo<SidebarThread[]>(
    () =>
      (conversations ?? [])
        .map(conversation =>
          toSidebarThread(conversation, {
            readAt: threadReadAtById[conversation.id],
          })
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations, threadReadAtById]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  const filteredThreads = useMemo(
    () =>
      normalizedQuery.length === 0
        ? sidebarThreads
        : sidebarThreads.filter(thread => {
            const haystack = `${thread.title} ${thread.status}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          }),
    [normalizedQuery, sidebarThreads]
  );

  const unreadCount = sidebarThreads.filter(thread => thread.unread).length;

  return (
    <PageShell
      data-testid='threads-page'
      className='h-full'
      frame='content-container'
      contentPadding='none'
      surfaceMode='default'
    >
      <div className='flex h-full min-h-0 flex-col'>
        <PageHeader
          title='Threads'
          description='Recent conversations, sorted by the last update.'
          action={
            <Button asChild variant='secondary' size='sm'>
              <Link href={APP_ROUTES.CHAT}>New thread</Link>
            </Button>
          }
          className='shrink-0'
        />

        <div className='shrink-0 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)] px-4 py-3 sm:px-6'>
          <AppSearchField
            value={query}
            onChange={setQuery}
            placeholder='Search threads'
            ariaLabel='Search threads'
            className='max-w-2xl'
            inputClassName='text-[13px]'
          />
          <div className='mt-2 flex items-center gap-3 text-[11px] text-tertiary-token'>
            <span>{sidebarThreads.length} threads</span>
            <span className='inline-flex items-center gap-1'>
              <Search className='h-3 w-3' />
              Search is local to thread titles and statuses
            </span>
            {unreadCount > 0 ? <span>{unreadCount} unread</span> : null}
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'>
          {isLoading ? (
            <ThreadListSkeleton />
          ) : isError ? (
            <PageErrorState
              title='Unable to load threads'
              message='We could not load your recent threads. Retry the request or refresh the page.'
              error={error instanceof Error ? error : undefined}
              actionLabel='Retry load'
              onRetry={() => {
                refetch();
              }}
              secondaryAction={{
                label: 'Refresh page',
                onClick: () => globalThis.location.reload(),
              }}
            />
          ) : filteredThreads.length === 0 ? (
            <div className='grid min-h-[18rem] place-items-center rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--linear-app-frame-seam)_48%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,transparent)] px-6 py-10 text-center'>
              <div className='max-w-sm space-y-3'>
                <p className='text-[14px] font-semibold text-primary-token'>
                  {normalizedQuery
                    ? `No threads match "${trimmedQuery}".`
                    : 'No threads yet'}
                </p>
                <p className='text-[13px] leading-6 text-secondary-token'>
                  {normalizedQuery
                    ? 'Clear the search or try a different phrase.'
                    : 'Start a new thread to see conversations appear here.'}
                </p>
                <Button asChild variant='secondary' size='sm'>
                  <Link href={APP_ROUTES.CHAT}>New thread</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className='space-y-1.5'>
              {filteredThreads.map(thread => (
                <SidebarThreadRow
                  key={thread.id}
                  thread={thread}
                  active={false}
                  unread={!!thread.unread}
                  hasThreadActions={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
