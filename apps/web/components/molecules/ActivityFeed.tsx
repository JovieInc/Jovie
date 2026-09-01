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
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ActivityAction, ActivityEvent } from '@/lib/activity/types';
import { cn } from '@/lib/utils';

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
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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

export const ACTIVITY_TIMELINE_LIST_CLASSNAME = 'space-y-0.5';
export const ACTIVITY_TIMELINE_ROW_SHELL_CLASSNAME =
  'relative flex w-full min-w-0 items-start gap-3 rounded-md px-1.5 py-1';
export const ACTIVITY_TIMELINE_INTERACTIVE_CLASSNAME =
  'transition-[background-color] duration-subtle ease-subtle hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-base';
export const ACTIVITY_TIMELINE_LINE_CLASSNAME =
  'absolute left-1.5 top-0 bottom-0 ml-3 w-px bg-(--linear-border-subtle) group-last:hidden';
export const ACTIVITY_TIMELINE_LEADING_CLASSNAME =
  'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-0';
export const ACTIVITY_TIMELINE_BODY_CLASSNAME = 'min-w-0 flex-1';
export const ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME =
  'text-app leading-[18px] tracking-tight';
export const ACTIVITY_TIMELINE_META_CLASSNAME =
  'mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-2xs text-tertiary-token';

interface ActivityTimelineIconProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ActivityTimelineIcon({
  children,
  className,
}: ActivityTimelineIconProps) {
  return (
    <span
      aria-hidden='true'
      className={cn(ACTIVITY_TIMELINE_LEADING_CLASSNAME, className)}
      data-testid='activity-timeline-leading'
    >
      {children}
    </span>
  );
}

interface ActivityTimelineMetaProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ActivityTimelineMeta({
  children,
  className,
}: ActivityTimelineMetaProps) {
  return (
    <div className={cn(ACTIVITY_TIMELINE_META_CLASSNAME, className)}>
      {children}
    </div>
  );
}

interface ActivityTimelineTimestampProps {
  readonly children: ReactNode;
  readonly dateTime: string;
  readonly className?: string;
}

export function ActivityTimelineTimestamp({
  children,
  dateTime,
  className,
}: ActivityTimelineTimestampProps) {
  return (
    <time
      dateTime={dateTime}
      className={cn('tabular-nums', className)}
      data-testid='activity-timeline-timestamp'
    >
      {children}
    </time>
  );
}

interface ActivityTimelineLineProps {
  readonly testId?: string;
}

export function ActivityTimelineLine({
  testId = 'activity-timeline-line',
}: ActivityTimelineLineProps) {
  return (
    <div
      aria-hidden='true'
      className={ACTIVITY_TIMELINE_LINE_CLASSNAME}
      data-testid={testId}
    />
  );
}

interface ActivityTimelineRowProps {
  readonly as?: 'div' | 'li';
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly href?: string;
  readonly interactive?: boolean;
  readonly leading: ReactNode;
  readonly testId?: string;
}

export function ActivityTimelineRow({
  as = 'li',
  children,
  className,
  contentClassName,
  href,
  interactive = false,
  leading,
  testId = 'activity-timeline-row',
}: ActivityTimelineRowProps) {
  const Container = as;
  const shellClassName = cn(
    ACTIVITY_TIMELINE_ROW_SHELL_CLASSNAME,
    (href || interactive) && ACTIVITY_TIMELINE_INTERACTIVE_CLASSNAME,
    className
  );
  const content = (
    <>
      {leading}
      <div className={cn(ACTIVITY_TIMELINE_BODY_CLASSNAME, contentClassName)}>
        {children}
      </div>
    </>
  );

  return (
    <Container className='group relative' data-testid={testId}>
      <ActivityTimelineLine />
      {href ? (
        <Link
          href={href}
          className={shellClassName}
          data-testid='activity-timeline-row-shell'
        >
          {content}
        </Link>
      ) : (
        <div
          className={shellClassName}
          data-testid='activity-timeline-row-shell'
        >
          {content}
        </div>
      )}
    </Container>
  );
}

function ActivityIcon({ action }: { readonly action: ActivityAction }) {
  const IconComponent = ACTION_ICONS[action] ?? Plus;
  return (
    <ActivityTimelineIcon>
      <IconComponent className='h-3 w-3 text-tertiary-token' aria-hidden />
    </ActivityTimelineIcon>
  );
}

export function ActivityFeedSkeleton({ rows = 4 }: { readonly rows?: number }) {
  const safeRows = Math.max(0, rows);
  const skeletonKeys = Array.from(
    { length: safeRows },
    (_, index) => `activity-skeleton-row-${index + 1}`
  );

  return (
    <div className={ACTIVITY_TIMELINE_LIST_CLASSNAME} aria-busy='true'>
      {skeletonKeys.map(skeletonKey => (
        <div key={skeletonKey} className='group relative' aria-hidden='true'>
          <ActivityTimelineLine testId='activity-timeline-skeleton-line' />
          <div className={ACTIVITY_TIMELINE_ROW_SHELL_CLASSNAME}>
            <div className='relative z-10 h-6 w-6 shrink-0 rounded-full bg-surface-0 skeleton' />
            <div className='min-w-0 flex-1 space-y-1.5 pt-0.5'>
              <div className='h-3 w-[72%] rounded skeleton' />
              <div className='h-2.5 w-[24%] rounded skeleton' />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityEventRow({ event }: { readonly event: ActivityEvent }) {
  const isSystem = event.actor?.type === 'system';
  return (
    <ActivityTimelineRow
      as='div'
      interactive
      leading={<ActivityIcon action={event.action} />}
    >
      <p
        className={`${ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME} text-secondary-token`}
      >
        {event.description}
      </p>
      <ActivityTimelineMeta>
        {isSystem && (
          <>
            <Bot className='h-3 w-3' aria-hidden />
            <span>{event.actor?.name}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <ActivityTimelineTimestamp dateTime={event.createdAt.toISOString()}>
          {formatRelativeTime(event.createdAt)}
        </ActivityTimelineTimestamp>
      </ActivityTimelineMeta>
    </ActivityTimelineRow>
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
        className={ACTIVITY_TIMELINE_LIST_CLASSNAME}
        role='feed'
        aria-label='Activity Feed'
        aria-busy='true'
      >
        <ActivityFeedSkeleton rows={4} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className='flex min-h-30 items-center rounded-md bg-surface-1 px-2.5'>
        <p className='text-xs leading-[17px] text-secondary-token'>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const sorted = [...events].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <div
      className={ACTIVITY_TIMELINE_LIST_CLASSNAME}
      role='feed'
      aria-label='Activity Feed'
    >
      {sorted.map(event => (
        <ActivityEventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
