'use client';

import { MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// Thread types — co-located so consumers import from one place.
// NOTE: this shape is shell-v1's flat prop contract. Production's useThreads()
// (React Query, features/chat) returns a different shape with `conversationId`
// + message counts. A SidebarThread adapter hook is a follow-on PR — for now,
// callers should pass an empty array until the adapter lands.

export type ThreadStatus = 'running' | 'complete' | 'errored';

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
}

export interface SidebarThreadsSectionProps {
  readonly threads: readonly SidebarThread[];
  readonly activeThreadId: string | null;
  readonly onSelect?: (id: string) => void;
  readonly onThreadContextMenu?: (
    e: React.MouseEvent,
    thread: SidebarThread
  ) => void;
  // `tight` drops row height to 24px (h-6) to match dense workspace lists.
  readonly tight?: boolean;
  // `collapsed` hides the section entirely (sidebar icon mode).
  readonly collapsed: boolean;
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
  tight,
  collapsed,
}: SidebarThreadsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [threads]
  );

  if (collapsed) return null;
  if (sorted.length === 0) return null;

  const visible = expanded ? sorted.slice(0, 10) : sorted.slice(0, 5);
  // Show toggle only when there's more than the collapsed slice. Avoids
  // a "View all" → "no Show less" stuck state on 1–10 threads.
  const hasMore = sorted.length > 5;
  const unreadCount = sorted.filter(t => t.unread).length;

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
        {visible.map(t => {
          const active = activeThreadId === t.id;
          const unread = !!t.unread && !active;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: row hosts two real buttons; div is hover container with right-click menu
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same
            <div
              key={t.id}
              className={cn(
                'group/thread relative flex items-center rounded-md transition-colors duration-150 ease-out',
                tight ? 'h-6' : 'h-7',
                active
                  ? 'bg-surface-1 text-primary-token'
                  : unread
                    ? 'text-primary-token hover:bg-surface-1/50'
                    : 'text-tertiary-token hover:bg-surface-1/50 hover:text-primary-token'
              )}
              onContextMenu={e => onThreadContextMenu?.(e, t)}
            >
              <button
                type='button'
                onClick={() => onSelect?.(t.id)}
                className={cn(
                  'flex-1 flex items-center gap-2 min-w-0 text-left',
                  tight ? 'h-6 pl-2.5 pr-2' : 'h-7 pl-3 pr-2'
                )}
              >
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
              </button>
              <button
                type='button'
                onClick={e => onThreadContextMenu?.(e, t)}
                aria-label='Thread actions'
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-150 ease-out',
                  'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100'
                )}
              >
                <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
              </button>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type='button'
          onClick={() => setExpanded(v => !v)}
          className='w-full text-left px-3 py-1 text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token hover:text-secondary-token transition-colors duration-150 ease-out'
        >
          {expanded ? 'Show less' : 'View all'}
        </button>
      )}
    </div>
  );
}
