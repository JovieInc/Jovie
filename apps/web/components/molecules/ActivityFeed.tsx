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
    <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05]'>
      <IconComponent className='h-3 w-3 text-tertiary-token' aria-hidden />
    </div>
  );
}

function ActivityEventRow({ event }: { readonly event: ActivityEvent }) {
  const isSystem = event.actor?.type === 'system';
  return (
    <div className='group flex items-start gap-3 py-1.5'>
      <ActivityIcon action={event.action} />
      <div className='min-w-0 flex-1'>
        <p className='text-[13px] leading-[18px] text-secondary-token'>
          {event.description}
        </p>
        <div className='mt-0.5 flex items-center gap-1.5 text-[11px] text-quaternary-token'>
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
}

export function ActivityFeed({
  events,
  emptyMessage = 'No activity yet.',
}: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <p className='py-4 text-center text-[13px] text-quaternary-token'>
        {emptyMessage}
      </p>
    );
  }

  const sorted = [...events].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <div
      className='divide-y divide-white/[0.05]'
      role='feed'
      aria-label='Activity feed'
    >
      {sorted.map(event => (
        <ActivityEventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
