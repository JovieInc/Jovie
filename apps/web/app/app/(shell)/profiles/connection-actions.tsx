'use client';

import {
  CircleDollarSign,
  ExternalLink,
  Eye,
  Link2,
  RefreshCw,
} from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ConnectionPrimaryAction } from '@/lib/profile-surfaces/workspace';
import type { ProfileWorkspaceRow } from './data';

export interface BuildConnectionActionsCallbacks {
  readonly onViewDetails: (row: ProfileWorkspaceRow) => void;
  readonly onOpen: (row: ProfileWorkspaceRow) => void;
  readonly onPrimaryAction: (row: ProfileWorkspaceRow) => void;
}

const PRIMARY_ACTION_COPY: Record<
  Exclude<ConnectionPrimaryAction, 'open'>,
  { readonly label: string; readonly icon: typeof Link2 }
> = {
  connect: { label: 'Connect', icon: Link2 },
  reconnect: { label: 'Reconnect', icon: RefreshCw },
  review: { label: 'Review Connection', icon: Eye },
  upgrade: { label: 'Upgrade Monitoring', icon: CircleDollarSign },
};

/**
 * Canonical action registry for a Presence workspace entity.
 *
 * The returned items feed the row context menu, row ellipsis menu, and right
 * rail overflow menu so those entry points cannot drift independently.
 */
export function buildConnectionActions(
  row: ProfileWorkspaceRow,
  primaryAction: ConnectionPrimaryAction,
  callbacks: BuildConnectionActionsCallbacks
): ContextMenuItemType[] {
  const entityLabel = row.rowType === 'connector' ? 'Connection' : 'Profile';
  const items: ContextMenuItemType[] = [
    {
      id: 'view-details',
      label: 'View Details',
      icon: <Eye className='h-3.5 w-3.5' aria-hidden />,
      onClick: () => callbacks.onViewDetails(row),
    },
    {
      id: 'open-connection',
      label: `Open ${entityLabel}`,
      icon: <ExternalLink className='h-3.5 w-3.5' aria-hidden />,
      onClick: () => callbacks.onOpen(row),
    },
  ];

  if (primaryAction !== 'open') {
    const action = PRIMARY_ACTION_COPY[primaryAction];
    const Icon = action.icon;
    const actionLabel =
      primaryAction === 'review' && row.rowType === 'surface'
        ? 'Review Profile'
        : action.label;
    items.push(
      { type: 'separator' },
      {
        id: `connection-${primaryAction}`,
        label: actionLabel,
        icon: <Icon className='h-3.5 w-3.5' aria-hidden />,
        onClick: () => callbacks.onPrimaryAction(row),
      }
    );
  }

  return items;
}
