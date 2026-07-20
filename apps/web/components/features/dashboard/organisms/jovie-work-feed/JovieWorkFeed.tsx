'use client';

import {
  Bell,
  Bot,
  CheckCircle2,
  CircleDashed,
  ImageIcon,
  Package,
  Sparkles,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import { ActivityFeedSkeleton } from '@/components/molecules/ActivityFeed';
import type {
  JovieWorkIcon,
  JovieWorkItem,
  JovieWorkPhase,
} from '@/lib/activity/jovie-work-feed';
import { useJovieWorkFeedQuery } from '@/lib/queries/useJovieWorkFeedQuery';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { JovieWorkFeedProps } from './types';

const JOVIE_WORK_ICONS: Record<JovieWorkIcon, typeof Sparkles> = {
  workflow: Workflow,
  agent: Bot,
  approval: CheckCircle2,
  retouch: ImageIcon,
  merch: Package,
  metadata: Sparkles,
  notification: Bell,
};

const PHASE_STYLES: Record<JovieWorkPhase, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

function JovieWorkGlyph({ icon }: { readonly icon: JovieWorkIcon }) {
  const Icon = JOVIE_WORK_ICONS[icon] ?? Sparkles;

  return <Icon className='h-4 w-4 text-tertiary-token' aria-hidden='true' />;
}

function JovieWorkEmptyState({
  isRefreshing,
}: {
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <div className='flex min-h-35 items-center rounded-md bg-surface-1 px-2'>
        <p className='text-xs leading-[17px] text-secondary-token'>
          Jovie has not shipped autonomous work in this window yet. Release
          autopilot, fan notifications, and agent runs will show up here.
        </p>
      </div>
    </div>
  );
}

const JovieWorkItemRow = memo(function JovieWorkItemRow({
  item,
}: {
  readonly item: JovieWorkItem;
}) {
  const content = (
    <>
      <span
        aria-hidden='true'
        className='relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-0 text-base'
      >
        <JovieWorkGlyph icon={item.icon} />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='text-app font-caption tracking-tight text-primary-token'>
            {item.title}
          </p>
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-2xs font-caption',
              PHASE_STYLES[item.phase]
            )}
          >
            {item.statusLabel}
          </span>
        </div>
        <p className='mt-0.5 text-app leading-5 tracking-tight text-secondary-token'>
          <span className='tabular-nums text-tertiary-token'>
            {formatTimeAgo(item.timestamp)}
          </span>
          <span className='text-tertiary-token'> - </span>
          <span>{item.description}</span>
        </p>
      </div>
    </>
  );

  if (item.href) {
    return (
      <li className='relative'>
        <div
          aria-hidden='true'
          className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle)'
        />
        <Link
          href={item.href}
          className='group relative flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-[background-color] duration-subtle ease-subtle hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)'
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className='relative'>
      <div
        aria-hidden='true'
        className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle)'
      />
      <div className='group relative flex items-start gap-2.5 rounded-md px-1.5 py-1.5'>
        {content}
      </div>
    </li>
  );
});

export function JovieWorkFeed({ profileId, range = '7d' }: JovieWorkFeedProps) {
  const {
    data: items = [],
    isLoading,
    isFetching,
    error,
  } = useJovieWorkFeedQuery({
    profileId,
    range,
  });

  const isRefreshing = isFetching && !isLoading;

  return (
    <div className='space-y-1.5' data-testid='jovie-work-feed'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-2'>
          <div className='flex h-6 w-6 items-center justify-center rounded-full bg-surface-0'>
            <CircleDashed
              className='h-4 w-4 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
          <h3 className='text-app font-caption tracking-tight text-secondary-token'>
            Jovie Did This
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-1.5 text-2xs font-caption text-tertiary-token'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse'
          />
          <span>Live</span>
        </span>
      </div>

      <div className='min-h-45'>
        {(() => {
          if (error) {
            return (
              <p className='text-app text-error-token'>
                {error.message || 'Failed to load Jovie work feed'}
              </p>
            );
          }

          if (isLoading) {
            return <ActivityFeedSkeleton rows={4} />;
          }

          if (items.length === 0) {
            return <JovieWorkEmptyState isRefreshing={isRefreshing} />;
          }

          return (
            <div
              className={
                isRefreshing ? 'opacity-70 transition-opacity' : undefined
              }
            >
              <ul className='space-y-0.5'>
                {items.map(item => (
                  <JovieWorkItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {items.length > 0 &&
          `${items.length} ${items.length === 1 ? 'item' : 'items'} loaded`}
        {isRefreshing && 'Refreshing Jovie work feed'}
        {error && `Error: ${error.message || 'Failed to load Jovie work feed'}`}
      </div>
    </div>
  );
}
