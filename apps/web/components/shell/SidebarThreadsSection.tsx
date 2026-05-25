'use client';

import { MessageSquarePlus, MoreHorizontal, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getSidebarNavRowClassName } from './SidebarNavItem';
import { Tooltip } from './Tooltip';

// Thread types — co-located so consumers import from one place. Production
// adapters should map real conversation records into this flat shell contract.

export type ThreadStatus = 'running' | 'complete' | 'errored';
export type SidebarThreadListState = 'idle' | 'loading' | 'error';

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
        tight ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]'
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
      className: hasThreadActions ? 'pr-8' : undefined,
    }),
    'text-left',
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
      <span
        className={cn(
          'min-w-0 truncate text-left justify-self-start',
          'text-[12.5px]',
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
        'group/thread relative flex items-center',
        tight ? 'h-6' : 'h-7'
      )}
    >
      <Tooltip label={thread.title} side='right' block>
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
          <button
            type='button'
            onClick={() => onSelect?.(thread.id)}
            onContextMenu={e => onThreadContextMenu?.(e, thread)}
            aria-pressed={active}
            className={rowClasses}
          >
            {rowContent}
          </button>
        )}
      </Tooltip>
      {onThreadContextMenu ? (
        <Tooltip label='Thread actions' side='right'>
          <button
            type='button'
            onClick={e => onThreadContextMenu(e, thread)}
            aria-label={`Thread actions for ${thread.title}`}
            className={cn(
              'absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-quaternary-token transition-[background-color,color,opacity] duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
              'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100'
            )}
          >
            <MoreHorizontal
              className='h-3 w-3'
              strokeWidth={2.25}
              aria-hidden='true'
            />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
});

// Status dot tones:
//   running → cyan, anim-calm-breath
//   errored → rose
//   unread  → cyan static
//   read    → dim white
export function SidebarThreadsSection({
  threads,
  activeThreadId,
  onSelect,
  onThreadContextMenu,
  state = 'idle',
  onRetry,
  onNewThread,
  tight,
  collapsed,
}: SidebarThreadsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [threads]
  );

  if (collapsed) return null;
  if (state === 'idle' && sorted.length === 0 && !onNewThread) return null;

  const visible = expanded ? sorted.slice(0, 10) : sorted.slice(0, 5);
  // Show toggle only when there's more than the collapsed slice. Avoids
  // a "View all" → "no Show less" stuck state on 1–10 threads.
  const hasMore = sorted.length > 5;
  const unreadCount = sorted.filter(t => t.unread).length;
  const hasThreads = sorted.length > 0;

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between border-t border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)] px-2.5 pb-0.5 pt-2'>
        <span className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-quaternary-token'>
          Threads
        </span>
        {unreadCount > 0 && (
          <span className='inline-flex items-center gap-1 text-[11px] font-medium text-quaternary-token'>
            <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/85' />
            {unreadCount}
          </span>
        )}
      </div>

      <div
        className={cn(
          'flex flex-col gap-px',
          expanded && 'max-h-[320px] overflow-y-auto'
        )}
      >
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
              tight ? 'h-6 text-[12px]' : 'h-6.5 text-[12.5px]'
            )}
          >
            <span className='min-w-0 flex-1 truncate'>Threads unavailable</span>
            {onRetry ? (
              <button
                type='button'
                onClick={onRetry}
                aria-label='Retry threads'
                className='grid h-5 w-5 shrink-0 place-items-center rounded text-quaternary-token transition-[background-color] duration-subtle ease-subtle hover:bg-sidebar-accent/55 hover:text-primary-token'
              >
                <RefreshCw
                  className='h-3 w-3'
                  aria-hidden='true'
                  strokeWidth={2.25}
                />
              </button>
            ) : null}
          </div>
        ) : null}
        {state === 'idle' && !hasThreads && onNewThread ? (
          <button
            type='button'
            onClick={onNewThread}
            className={cn(
              getSidebarNavRowClassName({
                tight,
                tone: 'primary',
              }),
              'text-left'
            )}
          >
            <MessageSquarePlus
              className='h-3.5 w-3.5 shrink-0 justify-self-center text-quaternary-token'
              aria-hidden='true'
              strokeWidth={2.25}
            />
            <span className='min-w-0 truncate justify-self-start'>
              New chat
            </span>
          </button>
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
      </div>

      {hasMore && (
        <button
          type='button'
          onClick={() => setExpanded(v => !v)}
          className='w-full px-3 py-1 text-left text-[11px] font-medium text-quaternary-token transition-[background-color] duration-subtle ease-subtle hover:text-secondary-token'
        >
          {expanded ? 'Show less' : 'View all'}
        </button>
      )}
    </div>
  );
}
