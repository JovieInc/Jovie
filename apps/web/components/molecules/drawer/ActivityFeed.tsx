'use client';

import { cn } from '@/lib/utils';
import { DrawerInlineNote } from './DrawerInlineNote';

export interface EntityRailActivityItem {
  readonly id: string;
  readonly actor: string;
  readonly verb: string;
  readonly object: string;
  /** ISO date or Date — time-grouped into Today / Yesterday / date. */
  readonly at: string | Date;
}

export interface ActivityFeedProps {
  readonly items: readonly EntityRailActivityItem[];
  readonly className?: string;
  readonly 'data-testid'?: string;
}

function startOfDay(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  );
}

function dayGroupLabel(at: Date): string {
  const days =
    (startOfDay(new Date()) - startOfDay(at)) / (24 * 60 * 60 * 1000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function timeLabel(at: Date): string {
  return at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

type NormalizedActivityItem = Omit<EntityRailActivityItem, 'at'> & {
  readonly at: Date;
};

interface ActivityGroup {
  readonly label: string;
  readonly items: readonly NormalizedActivityItem[];
}

function groupByDay(items: readonly EntityRailActivityItem[]): ActivityGroup[] {
  const groups: { label: string; items: NormalizedActivityItem[] }[] = [];
  for (const item of items) {
    const at = item.at instanceof Date ? item.at : new Date(item.at);
    const label = dayGroupLabel(at);
    const entry: NormalizedActivityItem = { ...item, at };
    const group = groups.find(candidate => candidate.label === label);
    if (group) group.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

/** Time-grouped activity shared by entity rails. */
export function ActivityFeed({
  items,
  className,
  'data-testid': testId,
}: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <DrawerInlineNote
        message='No activity yet.'
        className={className}
        testId={testId ?? 'entity-rail-activity-feed'}
      />
    );
  }
  const groups = groupByDay(items);
  return (
    <div
      data-testid={testId ?? 'entity-rail-activity-feed'}
      data-slot='entity-rail-activity-feed'
      className={cn('space-y-2', className)}
    >
      {groups.map(group => (
        <div
          key={group.label}
          data-activity-group={group.label}
          className='space-y-1'
        >
          <p className='text-2xs font-caption tracking-normal text-tertiary-token'>
            {group.label}
          </p>
          <ul className='space-y-1'>
            {group.items.map(item => (
              <li
                key={item.id}
                data-testid='entity-rail-activity-item'
                className='flex items-baseline gap-2'
              >
                <span className='tabular-nums text-2xs text-tertiary-token'>
                  {timeLabel(item.at)}
                </span>
                <p className='min-w-0 flex-1 text-xs text-secondary-token'>
                  <span className='font-medium text-primary-token'>
                    {item.actor}
                  </span>{' '}
                  {item.verb}{' '}
                  <span className='font-medium text-primary-token'>
                    {item.object}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
