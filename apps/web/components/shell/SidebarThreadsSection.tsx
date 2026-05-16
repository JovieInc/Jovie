'use client';

import {
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

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
        'flex items-center gap-2 rounded-md px-3 text-tertiary-token',
        tight ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]'
      )}
    >
      <span className='grid h-3.5 w-3.5 shrink-0 place-items-center text-quaternary-token'>
        {icon}
      </span>
      <span className='min-w-0 flex-1 truncate'>{children}</span>
    </div>
  );
}

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
    <div className='space-y-1'>
      <div className='px-3 pt-1 pb-1 flex items-center justify-between'>
        <span className='text-[9.5px] font-medium uppercase tracking-[0.12em] text-quaternary-token/85'>
          Threads
        </span>
        {unreadCount > 0 && (
          <span className='inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-quaternary-token'>
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
              <Loader2
                className='h-3 w-3 animate-spin'
                aria-hidden='true'
                strokeWidth={2.25}
              />
            }
          >
            Loading threads
          </SidebarThreadStatusRow>
        ) : null}
        {state === 'error' && !hasThreads ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 text-tertiary-token',
              tight ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]'
            )}
          >
            <span className='min-w-0 flex-1 truncate'>Threads unavailable</span>
            {onRetry ? (
              <button
                type='button'
                onClick={onRetry}
                aria-label='Retry threads'
                className='grid h-5 w-5 shrink-0 place-items-center rounded text-quaternary-token transition-colors duration-subtle ease-out hover:bg-sidebar-accent/55 hover:text-primary-token'
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
              'flex items-center gap-2 rounded-md px-3 text-left text-tertiary-token transition-colors duration-subtle ease-out hover:bg-sidebar-accent/55 hover:text-primary-token',
              tight ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]'
            )}
          >
            <MessageSquarePlus
              className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
              aria-hidden='true'
              strokeWidth={2.25}
            />
            <span className='min-w-0 flex-1 truncate'>Start a thread</span>
          </button>
        ) : null}
        {visible.map(t => {
          const active = activeThreadId === t.id;
          const unread = !!t.unread && !active;
          const rowClasses = cn(
            'flex-1 flex items-center gap-2 min-w-0 text-left',
            tight ? 'h-6 pl-2.5 pr-2' : 'h-7 pl-3 pr-2'
          );
          const rowContent = (
            <>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  t.status === 'running'
                    ? 'bg-cyan-300/85 anim-calm-breath'
                    : t.status === 'errored'
                      ? 'bg-rose-400/85'
                      : unread
                        ? 'bg-cyan-300/85'
                        : 'bg-white/25'
                )}
              />
              <span
                className={cn(
                  'flex-1 truncate',
                  tight ? 'text-[12px]' : 'text-[12.5px]',
                  unread && 'font-medium'
                )}
              >
                {t.title}
              </span>
            </>
          );
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: row hosts a real link/button; div is hover container with right-click menu
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same
            <div
              key={t.id}
              className={cn(
                'group/thread relative flex items-center rounded-md transition-colors duration-subtle ease-out',
                tight ? 'h-6' : 'h-7',
                active
                  ? 'bg-surface-1 text-primary-token'
                  : unread
                    ? 'text-primary-token hover:bg-surface-1/50'
                    : 'text-tertiary-token hover:bg-surface-1/50 hover:text-primary-token'
              )}
              onContextMenu={e => onThreadContextMenu?.(e, t)}
            >
              {t.href ? (
                <Link href={t.href} className={rowClasses}>
                  {rowContent}
                </Link>
              ) : (
                <button
                  type='button'
                  onClick={() => onSelect?.(t.id)}
                  className={rowClasses}
                >
                  {rowContent}
                </button>
              )}
              {onThreadContextMenu ? (
                <button
                  type='button'
                  onClick={e => onThreadContextMenu(e, t)}
                  aria-label='Thread actions'
                  className={cn(
                    'absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-subtle ease-out',
                    'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100'
                  )}
                >
                  <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type='button'
          onClick={() => setExpanded(v => !v)}
          className='w-full text-left px-3 py-1 text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token hover:text-secondary-token transition-colors duration-subtle ease-out'
        >
          {expanded ? 'Show less' : 'View all'}
        </button>
      )}
    </div>
  );
}
