'use client';

import { Button } from '@jovie/ui';

import {
  ArrowRight,
  MessageSquarePlus,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import { cn } from '@/lib/utils';
import { getSidebarNavRowClassName } from './SidebarNavItem';
import { Tooltip } from './Tooltip';

// Chat list types — co-located so consumers import from one place. Production
// adapters should map real conversation records into this flat shell contract.

export type ThreadStatus = 'running' | 'complete' | 'errored';
export type SidebarThreadListState = 'idle' | 'loading' | 'error';
export const THREAD_READ_STORAGE_KEY = 'jovie:sidebar-thread-read-at';

const IN_PROGRESS_CHAT_TURN_STATUSES = new Set([
  'reserved',
  'running',
  'streaming',
]);
const FAILED_CHAT_TURN_STATUSES = new Set([
  'failed_tool_unavailable',
  'failed_model_error',
  'failed_timeout',
  'failed_network',
]);

export interface SidebarThread {
  readonly id: string;
  readonly title: string;
  readonly status: ThreadStatus;
  readonly entityKind?: 'release' | 'track' | 'task';
  readonly entityId?: string;
  // ISO timestamp — rows are sorted most-recent first.
  readonly updatedAt: string;
  // Unread rows highlight in the sidebar to pull attention.
  readonly unread?: boolean;
  // App Router href for production navigation. Experiments can omit and use onSelect.
  readonly href?: string;
}

export interface SidebarThreadsSectionProps {
  readonly threads: readonly SidebarThread[];
  readonly activeThreadId: string | null;
  readonly allThreadsActive?: boolean;
  readonly onSelect?: (id: string) => void;
  readonly onThreadContextMenu?: (
    e: React.MouseEvent,
    thread: SidebarThread
  ) => void;
  readonly state?: SidebarThreadListState;
  readonly onRetry?: () => void;
  readonly onNewThread?: () => void;
  // `tight` drops row height to 24px (h-6) to match dense workspace lists.
  readonly tight?: boolean;
  // `collapsed` hides the section entirely (sidebar icon mode).
  readonly collapsed: boolean;
}

export function getSidebarThreadStatus(
  latestTurnStatus: string | null | undefined
): ThreadStatus {
  if (!latestTurnStatus) {
    return 'complete';
  }

  if (IN_PROGRESS_CHAT_TURN_STATUSES.has(latestTurnStatus)) {
    return 'running';
  }

  if (FAILED_CHAT_TURN_STATUSES.has(latestTurnStatus)) {
    return 'errored';
  }

  return 'complete';
}

export function readThreadReadState(): Record<string, string> {
  try {
    const stored = globalThis.localStorage?.getItem(THREAD_READ_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

export function writeThreadReadState(value: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(
      THREAD_READ_STORAGE_KEY,
      JSON.stringify(value)
    );
  } catch {
    // Storage can be unavailable in restricted browsers; row state still works.
  }
}

export function isTimestampAfter(
  candidate: string | null | undefined,
  baseline: string | null | undefined
): boolean {
  if (!candidate) return false;
  if (!baseline) return true;
  const candidateMs = Date.parse(candidate);
  const baselineMs = Date.parse(baseline);
  return Number.isFinite(candidateMs) && Number.isFinite(baselineMs)
    ? candidateMs > baselineMs
    : candidate > baseline;
}

export function toSidebarThread(
  conversation: Pick<
    ChatConversation,
    'id' | 'title' | 'updatedAt' | 'latestMessageRole' | 'latestTurnStatus'
  >,
  options: {
    readonly activeThreadId?: string | null;
    readonly readAt?: string | null;
  } = {}
): SidebarThread {
  const activeThreadId = options.activeThreadId ?? null;
  const readAt = options.readAt ?? null;
  const latestTurnStatus = conversation.latestTurnStatus ?? null;
  const unread =
    activeThreadId !== conversation.id &&
    conversation.latestMessageRole === 'assistant' &&
    isTimestampAfter(conversation.updatedAt, readAt);

  return {
    id: conversation.id,
    href: `${APP_ROUTES.CHAT}/${encodeURIComponent(conversation.id)}`,
    title: conversation.title?.trim() || 'Untitled chat',
    status: getSidebarThreadStatus(latestTurnStatus),
    updatedAt: conversation.updatedAt,
    unread,
  };
}

function SidebarThreadStatusRow({
  children,
  icon,
  tight,
}: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly tight?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-full px-2.5 text-tertiary-token',
        tight ? 'h-6 text-xs' : 'h-7 text-xs'
      )}
    >
      <span className='grid h-3.5 w-3.5 shrink-0 place-items-center justify-self-center text-quaternary-token'>
        {icon}
      </span>
      <span className='min-w-0 flex-1 truncate'>{children}</span>
    </div>
  );
}

// Memoized high-churn row renderer for real SidebarThread data (used in
// global shell sidebar + dashboard nav). Applies DS subtle motion and
// canonical focus rings. Prevents unnecessary re-renders on thread list churn.
const SidebarThreadRow = React.memo(function SidebarThreadRow({
  thread,
  active,
  unread,
  hasThreadActions,
  tight,
  onSelect,
  onThreadContextMenu,
}: {
  readonly thread: SidebarThread;
  readonly active: boolean;
  readonly unread: boolean;
  readonly hasThreadActions: boolean;
  readonly tight?: boolean;
  readonly onSelect?: (id: string) => void;
  readonly onThreadContextMenu?: (
    e: React.MouseEvent,
    thread: SidebarThread
  ) => void;
}) {
  const rowClasses = cn(
    getSidebarNavRowClassName({
      active,
      tight,
      // Always reserve trailing gutter so long titles never crash into the
      // seam / overflow menu. Extra pr when actions are present.
      className: hasThreadActions ? 'pr-8' : 'pr-2.5',
    }),
    // Button atom is inline-flex; force grid so the title column can shrink.
    'grid w-full min-w-0 text-left',
    active
      ? undefined
      : unread
        ? 'text-primary-token hover:bg-surface-1 focus-visible:bg-surface-1'
        : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 focus-visible:text-primary-token'
  );
  const rowContent = (
    <>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0 justify-self-center',
          thread.status === 'running'
            ? 'bg-cyan-300/85 anim-calm-breath'
            : thread.status === 'errored'
              ? 'bg-rose-400/85'
              : unread
                ? 'bg-cyan-300/85'
                : 'bg-white/25'
        )}
      />
      {/* Soft edge fade > hard ellipsis: titles stay readable without mid-glyph chops. */}
      <span
        className={cn(
          'min-w-0 w-full justify-self-stretch overflow-hidden whitespace-nowrap text-left text-xs',
          '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]',
          '[-webkit-mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]',
          unread && 'font-medium'
        )}
      >
        {thread.title}
      </span>
    </>
  );
  return (
    <div
      className={cn(
        'group/thread relative flex w-full min-w-0 items-center',
        tight ? 'h-6' : 'h-7'
      )}
    >
      <Tooltip
        label={thread.title}
        side='right'
        block
        className='min-w-0 w-full'
      >
        {thread.href ? (
          <Link
            href={thread.href}
            aria-current={active ? 'page' : undefined}
            className={rowClasses}
            onContextMenu={e => onThreadContextMenu?.(e, thread)}
          >
            {rowContent}
          </Link>
        ) : (
          <Button
            type='button'
            variant='ghost'
            onClick={() => onSelect?.(thread.id)}
            onContextMenu={e => onThreadContextMenu?.(e, thread)}
            aria-pressed={active}
            className={cn(rowClasses, 'h-auto hover:bg-transparent')}
          >
            {rowContent}
          </Button>
        )}
      </Tooltip>
      {onThreadContextMenu ? (
        <Tooltip label='Chat Actions' side='right'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={e => onThreadContextMenu(e, thread)}
            aria-label={`Chat Actions for ${thread.title}`}
            className={cn(
              'absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-quaternary-token transition-[background-color,color,opacity] duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55',
              'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100'
            )}
          >
            <MoreHorizontal
              className='h-3 w-3'
              strokeWidth={2.25}
              aria-hidden='true'
            />
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
});

export { SidebarThreadRow };

// Status dot tones:
//   running → cyan, anim-calm-breath
//   errored → rose
//   unread  → cyan static
//   read    → dim white
export function SidebarThreadsSection({
  threads,
  activeThreadId,
  allThreadsActive = false,
  onSelect,
  onThreadContextMenu,
  state = 'idle',
  onRetry,
  onNewThread,
  tight,
  collapsed,
}: SidebarThreadsSectionProps) {
  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [threads]
  );

  if (collapsed) return null;
  if (state === 'idle' && sorted.length === 0 && !onNewThread) return null;

  const visible = sorted.slice(0, 5);
  const unreadCount = sorted.filter(t => t.unread).length;
  const hasThreads = sorted.length > 0;

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between border-t border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)] px-2.5 pb-0.5 pt-2'>
        <span className='text-xs font-caption tracking-normal text-sidebar-muted/90'>
          Chats
        </span>
        {unreadCount > 0 && (
          <span className='inline-flex items-center gap-1 text-2xs font-medium text-quaternary-token'>
            <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/85' />
            {unreadCount}
          </span>
        )}
      </div>

      <div className='flex flex-col gap-px'>
        {state === 'loading' && !hasThreads ? (
          <SidebarThreadStatusRow
            tight={tight}
            icon={
              <div
                className='h-3.5 w-3.5 rounded-full skeleton motion-reduce:animate-none'
                aria-hidden='true'
              />
            }
          >
            <div
              className='h-3 w-20 rounded-sm skeleton motion-reduce:animate-none'
              aria-hidden='true'
            />
          </SidebarThreadStatusRow>
        ) : null}
        {state === 'error' && !hasThreads ? (
          <div
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_20px] items-center gap-2 rounded-full px-2.5 text-tertiary-token',
              tight ? 'h-6 text-xs' : 'h-6.5 text-xs'
            )}
          >
            <span className='min-w-0 flex-1 truncate'>
              Conversations unavailable
            </span>
            {onRetry ? (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={onRetry}
                aria-label='Retry Chats'
                className='grid h-5 w-5 shrink-0 place-items-center rounded text-quaternary-token transition-[background-color] duration-subtle ease-subtle hover:bg-sidebar-accent/55 hover:text-primary-token'
              >
                <RefreshCw
                  className='h-3 w-3'
                  aria-hidden='true'
                  strokeWidth={2.25}
                />
              </Button>
            ) : null}
          </div>
        ) : null}
        {state === 'idle' && !hasThreads && onNewThread ? (
          <Button
            type='button'
            variant='ghost'
            onClick={onNewThread}
            className={cn(
              getSidebarNavRowClassName({
                tight,
                tone: 'primary',
              }),
              'h-auto text-left hover:bg-transparent'
            )}
          >
            <MessageSquarePlus
              className='h-3.5 w-3.5 shrink-0 justify-self-center text-quaternary-token'
              aria-hidden='true'
              strokeWidth={2.25}
            />
            <span className='min-w-0 truncate justify-self-start'>
              New Chat
            </span>
          </Button>
        ) : null}
        {visible.map(t => {
          const active = activeThreadId === t.id;
          const unread = !!t.unread && !active;
          const hasThreadActions = Boolean(onThreadContextMenu);
          return (
            <SidebarThreadRow
              key={t.id}
              thread={t}
              active={active}
              unread={unread}
              hasThreadActions={hasThreadActions}
              tight={tight}
              onSelect={onSelect}
              onThreadContextMenu={onThreadContextMenu}
            />
          );
        })}
        {hasThreads ? (
          <Link
            href={APP_ROUTES.CHATS}
            aria-current={allThreadsActive ? 'page' : undefined}
            className={cn(
              getSidebarNavRowClassName({
                active: allThreadsActive,
                tight,
              }),
              'text-left'
            )}
          >
            <ArrowRight
              className='h-3.5 w-3.5 shrink-0 justify-self-center text-quaternary-token'
              aria-hidden='true'
              strokeWidth={2.25}
            />
            <span className='min-w-0 truncate justify-self-start'>
              All Chats
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
