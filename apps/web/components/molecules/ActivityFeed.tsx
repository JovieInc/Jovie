'use client';

import {
  Bot,
  CheckCircle2,
  GitMerge,
  Link2,
  LinkIcon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlink,
  Upload,
} from 'lucide-react';
import type { ActivityAction, ActivityEvent } from '@/lib/activity/types';

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ACTION_ICONS: Record<ActivityAction, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  enriched: Search,
  linked: Link2,
  unlinked: Unlink,
  synced: RefreshCw,
  published: Upload,
  imported: GitMerge,
  verified: CheckCircle2,
  claimed: LinkIcon,
};

function ActivityIcon({ action }: { readonly action: ActivityAction }) {
  const IconComponent = ACTION_ICONS[action] ?? Plus;
  return (
    <div className='relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-0'>
      <IconComponent className='h-3 w-3 text-tertiary-token' aria-hidden />
    </div>
  );
}

export function ActivityFeedSkeleton({ rows = 4 }: { readonly rows?: number }) {
  const safeRows = Math.max(0, rows);
  const skeletonKeys = Array.from(
    { length: safeRows },
    (_, index) => `activity-skeleton-row-${index + 1}`
  );

  return (
    <div className='space-y-0.5' aria-busy='true'>
      {skeletonKeys.map(skeletonKey => (
        <div
          key={skeletonKey}
          className='relative flex items-start gap-3 rounded-md px-1.5 py-1'
          aria-hidden='true'
        >
          <div className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle)' />
          <div className='relative z-10 h-6 w-6 shrink-0 rounded-full bg-surface-0 skeleton' />
          <div className='min-w-0 flex-1 space-y-1.5 pt-0.5'>
            <div className='h-3 w-[72%] rounded skeleton' />
            <div className='h-2.5 w-[24%] rounded skeleton' />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityEventRow({ event }: { readonly event: ActivityEvent }) {
  const isSystem = event.actor?.type === 'system';
  return (
    <div className='group relative flex items-start gap-3 rounded-md px-1.5 py-1 transition-[background-color] duration-150 hover:bg-surface-1 focus-within:bg-surface-1'>
      <div
        aria-hidden='true'
        className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle) group-last:hidden'
      />
      <ActivityIcon action={event.action} />
      <div className='min-w-0 flex-1'>
        <p className='text-app leading-[18px] tracking-[-0.01em] text-secondary-token'>
          {event.description}
        </p>
        <div className='mt-0.5 flex items-center gap-1.5 text-[11px] text-tertiary-token'>
          {isSystem && (
            <>
              <Bot className='h-3 w-3' aria-hidden />
              <span>{event.actor?.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={event.createdAt.toISOString()}>
            {formatRelativeTime(event.createdAt)}
          </time>
        </div>
      </div>
    </div>
  );
}

export interface ActivityFeedProps {
  readonly events: ActivityEvent[];
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
}

export function ActivityFeed({
  events,
  emptyMessage = 'No activity yet.',
  isLoading = false,
}: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div
        className='space-y-0.5'
        role='feed'
        aria-label='Activity feed'
        aria-busy='true'
      >
        <ActivityFeedSkeleton rows={4} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className='flex min-h-[120px] items-center rounded-md bg-surface-1 px-2.5'>
        <p className='text-[12px] leading-[17px] text-secondary-token'>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const sorted = [...events].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <div className='space-y-0.5' role='feed' aria-label='Activity feed'>
      {sorted.map(event => (
        <ActivityEventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
