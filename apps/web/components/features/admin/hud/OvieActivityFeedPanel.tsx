'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieActivityFeedPanel.test.tsx
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  GitPullRequest,
  Loader2,
  Megaphone,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TaskProjectionListRow } from '@/components/organisms/table';
import {
  composeOvieActivityFeed,
  type OvieActivityFeed,
  type OvieActivityState,
} from '@/lib/hud/ovie-activity-feed';
import type { OvieMacHudActivity } from '@/lib/hud/ovie-mac-hud';
import { cn } from '@/lib/utils';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

type RowVisual = {
  readonly className: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
};

function rowVisual(state: OvieActivityState): RowVisual {
  switch (state) {
    case 'queued':
      return { className: 'text-accent-purple', icon: Clock3 };
    case 'in-progress':
      return { className: 'text-accent-blue', icon: Loader2 };
    case 'merged':
      return { className: 'text-accent-green', icon: GitPullRequest };
    case 'deployed':
      return { className: 'text-accent-green', icon: CircleCheck };
    case 'public':
      return { className: 'text-accent-blue', icon: Megaphone };
    case 'blocked':
    case 'failed':
      return { className: 'text-accent-red', icon: CircleAlert };
  }
}

function observationVisual(observation: OvieActivityFeed['observation']) {
  switch (observation) {
    case 'ok':
      return { label: 'Live', tone: 'good' as const };
    case 'syncing':
      return { label: 'Syncing', tone: 'neutral' as const };
    case 'empty':
      return { label: 'No Activity', tone: 'neutral' as const };
    case 'unavailable':
      return { label: 'Unavailable', tone: 'bad' as const };
  }
}

function formatOccurredAt(value: string | null): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function OvieActivityFeedPanelView({
  feed,
}: Readonly<{ readonly feed: OvieActivityFeed }>) {
  const observation = observationVisual(feed.observation);

  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='ovie-activity-feed'
    >
      <div className='flex min-h-16 items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
        <div className='min-w-0'>
          <h2 className='text-app font-semibold text-primary-token'>
            Activity
          </h2>
          <p className='truncate text-2xs text-tertiary-token'>
            Company work ledger — Linear, runtime, GitHub, dogfood receipts,
            public digest
          </p>
        </div>
        <HudStatusPill label={observation.label} tone={observation.tone} />
      </div>
      <div className='max-h-96 overflow-y-auto p-2' aria-live='polite'>
        {feed.rows.length === 0 ? (
          <div className='grid min-h-32 place-items-center text-center'>
            <p className='text-app text-secondary-token'>
              {feed.observation === 'syncing'
                ? 'Loading the work ledger…'
                : feed.observation === 'unavailable'
                  ? 'Activity sources unavailable.'
                  : 'No recorded activity yet.'}
            </p>
          </div>
        ) : (
          <div className='grid gap-1'>
            {feed.rows.map(row => {
              const visual = rowVisual(row.state);
              const Icon = visual.icon;
              const content = (
                <TaskProjectionListRow
                  testId={`activity-row-${row.key}`}
                  leading={
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        visual.className,
                        row.state === 'in-progress' && 'animate-spin'
                      )}
                      aria-hidden='true'
                    />
                  }
                  title={row.title}
                  metadata={
                    <div className='mt-px flex min-w-0 flex-wrap items-center gap-x-1.5 overflow-hidden text-3xs leading-4 text-tertiary-token'>
                      <span className={cn('font-medium', visual.className)}>
                        {row.stateLabel}
                      </span>
                      {row.linearIdentifier == null ? null : (
                        <span className='font-semibold'>
                          {row.linearIdentifier}
                        </span>
                      )}
                      <span>{row.sourceLabel}</span>
                      {row.detail == null ? null : <span>{row.detail}</span>}
                    </div>
                  }
                  actionSlot={
                    <span className='inline-flex w-16 justify-end truncate text-3xs font-medium text-secondary-token'>
                      {formatOccurredAt(row.occurredAtIso)}
                    </span>
                  }
                />
              );
              return row.href ? (
                <a
                  key={row.key}
                  href={row.href}
                  rel='noreferrer'
                  target='_blank'
                  className='block rounded-lg outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset'
                >
                  {content}
                </a>
              ) : (
                <div key={row.key} className='rounded-lg'>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

export function OvieActivityFeedPanel({
  activity,
  kioskToken = null,
}: Readonly<{
  readonly activity: OvieMacHudActivity;
  readonly kioskToken?: string | null;
}>) {
  const query = useHudShippingStateQuery(kioskToken);
  const feed = composeOvieActivityFeed({
    operational: query.operationalTasks,
    receipts: activity.receipts,
    receiptsAvailable: activity.receiptsAvailable,
    publicUpdates: activity.publicUpdates,
  });
  return <OvieActivityFeedPanelView feed={feed} />;
}
