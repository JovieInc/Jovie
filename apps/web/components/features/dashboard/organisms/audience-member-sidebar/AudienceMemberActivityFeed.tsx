'use client';

import { Icon } from '@/components/atoms/Icon';
import {
  ACTIVITY_TIMELINE_LIST_CLASSNAME,
  ActivityTimelineIcon,
  ActivityTimelineMeta,
  ActivityTimelineRow,
  ActivityTimelineTimestamp,
} from '@/components/molecules/ActivityFeed';
import { DrawerInlineNote } from '@/components/molecules/drawer';
import { renderAudienceEventSentence } from '@/lib/audience/activity-grammar';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

interface AudienceMemberActivityFeedProps {
  readonly member: AudienceMember;
}

export function AudienceMemberActivityFeed({
  member,
}: AudienceMemberActivityFeedProps) {
  const actions = member.latestActions;

  if (actions.length === 0) {
    return (
      <DrawerInlineNote message='Activity will appear here as this contact interacts with your profile.' />
    );
  }

  // Sort newest first (actions may already be sorted but ensure it)
  const sorted = [...actions]
    .sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, 10);

  return (
    <ul className={ACTIVITY_TIMELINE_LIST_CLASSNAME}>
      {sorted.map((action, index) => (
        <ActivityItem
          key={`${member.id}-activity-${action.label}-${action.timestamp ?? index}`}
          action={action}
        />
      ))}
    </ul>
  );
}

function ActivityItem({
  action,
}: {
  readonly action: AudienceMember['latestActions'][number];
}) {
  const rendered = renderAudienceEventSentence(action);
  const label = rendered.kind === 'sentence' ? rendered.text : action.label;
  const icon = rendered.kind === 'sentence' ? rendered.icon : 'Sparkles';
  const hasMeta =
    Boolean(action.sourceLabel) ||
    action.confidence === 'verified' ||
    Boolean(action.timestamp);

  return (
    <ActivityTimelineRow
      as='li'
      contentClassName='pt-px'
      leading={
        <ActivityTimelineIcon className='border border-subtle bg-surface-1 text-tertiary-token'>
          <Icon name={icon} className='h-3 w-3' />
        </ActivityTimelineIcon>
      }
    >
      <p className='truncate text-xs leading-4 text-primary-token'>{label}</p>
      {hasMeta ? (
        <ActivityTimelineMeta className='text-3xs'>
          {action.sourceLabel ? (
            <span className='max-w-35 truncate rounded bg-surface-0 px-1 text-secondary-token'>
              {action.sourceLabel}
            </span>
          ) : null}
          {action.confidence === 'verified' ? (
            <span className='rounded bg-surface-0 px-1 text-secondary-token'>
              Verified
            </span>
          ) : null}
          {action.timestamp ? (
            <ActivityTimelineTimestamp dateTime={action.timestamp}>
              {formatTimeAgo(action.timestamp)}
            </ActivityTimelineTimestamp>
          ) : null}
        </ActivityTimelineMeta>
      ) : null}
    </ActivityTimelineRow>
  );
}
