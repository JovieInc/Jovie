'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type VisibilityState,
} from '@tanstack/react-table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
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

export const AUDIENCE_TABLE_CONTAINER_CLASS =
  'h-full px-2.5 pb-2.5 pt-0 md:px-3 md:pb-3 md:pt-0';

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

export type AudienceTableLayout = 'narrow' | 'medium' | 'wide';

export function buildAudienceMemberColumns(mode: 'members' | 'subscribers') {
  return [
    memberColumnHelper.display({
      id: 'select',
      header: () => null,
      cell: SelectCell,
      size: 40,
      enableSorting: false,
    }),
    memberColumnHelper.accessor('displayName', {
      id: 'fan',
      header: 'Fan',
      cell: ({ row }) => <AudienceFanCell member={row.original} />,
      size: 9999,
      minSize: 220,
      enableSorting: false,
    }),
    memberColumnHelper.display({
      id: 'state',
      header: 'State',
      cell: ({ row }) => (
        <AudienceStateCell member={row.original} mode={mode} />
      ),
      size: 96,
      enableSorting: false,
    }),
    memberColumnHelper.display({
      id: 'alerts',
      header: 'Alerts',
      cell: ({ row }) => <AudienceAlertsCell member={row.original} />,
      size: 96,
      enableSorting: false,
    }),
    memberColumnHelper.accessor('engagementScore', {
      id: 'engagement',
      header: 'Engagement',
      cell: ({ row }) => (
        <AudienceEngagementBars score={row.original.engagementScore} />
      ),
      size: 80,
      enableSorting: true,
    }),
    memberColumnHelper.accessor('lastSeenAt', {
      id: 'last',
      header: 'Last',
      cell: ({ row }) => (
        <AudienceLastCell lastSeenAt={row.original.lastSeenAt} />
      ),
      size: 56,
      enableSorting: true,
    }),
    memberColumnHelper.display({
      id: 'action',
      header: () => <div className='text-right'>Action</div>,
      cell: ({ row }) => <AudienceActionCell member={row.original} />,
      size: 120,
      enableSorting: false,
      meta: { className: 'text-right' },
    }),
  ] as Array<ColumnDef<AudienceMember, unknown>>;
}

export function getAudienceTableLayout(width: number): AudienceTableLayout {
  if (width < 720) {
    return 'narrow';
  }
  if (width < 960) {
    return 'medium';
  }
  return 'wide';
}

export function getAudienceColumnVisibility(width: number): VisibilityState {
  switch (getAudienceTableLayout(width)) {
    case 'narrow':
      return {
        alerts: false,
        engagement: false,
        state: false,
        last: false,
      };
    case 'medium':
      return { alerts: false, engagement: false };
    case 'wide':
    default:
      return {};
  }
}

export function getAudienceTableMinWidth(width: number): number {
  switch (getAudienceTableLayout(width)) {
    case 'narrow':
      return 480;
    case 'medium':
      return 640;
    case 'wide':
    default:
      return TABLE_MIN_WIDTHS.SMALL;
  }
}
