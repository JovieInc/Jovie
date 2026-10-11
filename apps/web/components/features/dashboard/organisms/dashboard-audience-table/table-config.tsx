'use client';

import {
  type ColumnPriorityLayout,
  type ColumnPrioritySpec,
  columnPrioritySpecsFromDefs,
  resolveColumnPriorityLayout,
} from '@/components/organisms/table/column-priority';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import {
  type ColumnDef,
  createColumnHelper,
  type VisibilityState,
} from '@/lib/tanstack-table';
import type { AudienceMember } from '@/types';
import {
  AudienceActionCell,
  AudienceAlertsCell,
  AudienceEngagementBars,
  AudienceFanCell,
  AudienceLastCell,
  AudienceStateCell,
} from './cells';
import { SelectCell } from './utils/column-renderers';

const memberColumnHelper = createColumnHelper<AudienceMember>();

export const AUDIENCE_TABLE_CONTAINER_CLASS = 'h-full';

export const AUDIENCE_TABLE_SKELETON_COLUMN_CONFIG: Array<{
  readonly width?: string;
  readonly variant?: 'text' | 'avatar' | 'badge' | 'button' | 'meta';
}> = [
  { width: '1.25rem', variant: 'text' as const },
  { width: '14rem', variant: 'avatar' as const },
  { width: '4.5rem', variant: 'badge' as const },
  { width: '4.5rem', variant: 'badge' as const },
  { width: '4rem', variant: 'meta' as const },
  { width: '3rem', variant: 'meta' as const },
  { width: '5.5rem', variant: 'button' as const },
];

/** Fit budgets, not rendered sizes. Priority 2 appears at 720; priority 1 at 960. */
const AUDIENCE_FIT = {
  select: 40,
  fan: 220,
  action: 120,
  state: 200,
  last: 140,
  alerts: 120,
  engagement: 120,
} as const;

export type AudienceTableLayout = 'narrow' | 'medium' | 'wide';

export const AUDIENCE_COLUMN_SPECS: readonly ColumnPrioritySpec[] =
  columnPrioritySpecsFromDefs(buildAudienceMemberColumns('members'));

export function buildAudienceMemberColumns(mode: 'members' | 'subscribers') {
  return [
    memberColumnHelper.display({
      id: 'select',
      header: () => null,
      cell: SelectCell,
      size: 40,
      enableSorting: false,
      meta: { minWidth: AUDIENCE_FIT.select },
    }),
    memberColumnHelper.accessor('displayName', {
      id: 'fan',
      header: 'Fan',
      cell: ({ row }) => <AudienceFanCell member={row.original} />,
      size: 9999,
      minSize: 220,
      enableSorting: false,
      meta: { primary: true, minWidth: AUDIENCE_FIT.fan },
    }),
    memberColumnHelper.display({
      id: 'state',
      header: 'State',
      cell: ({ row }) => (
        <AudienceStateCell member={row.original} mode={mode} />
      ),
      size: 96,
      enableSorting: false,
      meta: {
        priority: 2,
        minWidth: AUDIENCE_FIT.state,
        compact: member => <AudienceStateCell member={member} mode={mode} />,
      },
    }),
    memberColumnHelper.display({
      id: 'alerts',
      header: 'Alerts',
      cell: ({ row }) => <AudienceAlertsCell member={row.original} />,
      size: 96,
      enableSorting: false,
      meta: {
        priority: 1,
        minWidth: AUDIENCE_FIT.alerts,
        compact: member =>
          member.hasActiveAlerts &&
          (member.activeAlertChannels?.length ?? 0) > 0 ? (
            <AudienceAlertsCell member={member} />
          ) : null,
      },
    }),
    memberColumnHelper.accessor('engagementScore', {
      id: 'engagement',
      header: 'Engagement',
      cell: ({ row }) => (
        <AudienceEngagementBars score={row.original.engagementScore} />
      ),
      size: 80,
      enableSorting: true,
      meta: {
        priority: 1,
        minWidth: AUDIENCE_FIT.engagement,
        compact: member => (
          <AudienceEngagementBars score={member.engagementScore} />
        ),
      },
    }),
    memberColumnHelper.accessor('lastSeenAt', {
      id: 'last',
      header: 'Last Seen',
      cell: ({ row }) => (
        <AudienceLastCell lastSeenAt={row.original.lastSeenAt} />
      ),
      size: 56,
      enableSorting: true,
      meta: {
        priority: 2,
        minWidth: AUDIENCE_FIT.last,
        compact: member => (
          <span className='inline-flex items-center'>
            <span className='sr-only'>Last seen </span>
            <AudienceLastCell lastSeenAt={member.lastSeenAt} />
          </span>
        ),
      },
    }),
    memberColumnHelper.display({
      id: 'action',
      header: () => <div className='text-right'>Action</div>,
      cell: ({ row }) => <AudienceActionCell member={row.original} />,
      size: 120,
      enableSorting: false,
      meta: { className: 'text-right', minWidth: AUDIENCE_FIT.action },
    }),
  ] as Array<ColumnDef<AudienceMember, unknown>>;
}

export function audienceTableMinWidthForLayout(
  layout: ColumnPriorityLayout
): number {
  if (layout.hiddenIds.includes('state')) return 480;
  if (layout.hiddenIds.includes('alerts')) return 640;
  return TABLE_MIN_WIDTHS.SMALL;
}

export function getAudienceTableLayout(width: number): AudienceTableLayout {
  const layout = resolveColumnPriorityLayout(AUDIENCE_COLUMN_SPECS, width);
  if (layout.hiddenIds.includes('state')) return 'narrow';
  if (layout.hiddenIds.includes('alerts')) return 'medium';
  return 'wide';
}

export function getAudienceColumnVisibility(width: number): VisibilityState {
  return resolveColumnPriorityLayout(AUDIENCE_COLUMN_SPECS, width).visibility;
}

export function getAudienceTableMinWidth(width: number): number {
  return audienceTableMinWidthForLayout(
    resolveColumnPriorityLayout(AUDIENCE_COLUMN_SPECS, width)
  );
}
