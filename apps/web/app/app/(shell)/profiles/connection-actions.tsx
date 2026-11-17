'use client';

import {
  CircleDollarSign,
  ExternalLink,
  Eye,
  Link2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ConnectionPrimaryAction } from '@/lib/profile-surfaces/workspace';
import type { ProfileWorkspaceRow } from './data';

export interface BuildConnectionActionsCallbacks {
  readonly onViewDetails: (row: ProfileWorkspaceRow) => void;
  readonly onOpen: (row: ProfileWorkspaceRow) => void;
  readonly onPrimaryAction: (row: ProfileWorkspaceRow) => void;
  readonly onRemoveLink?: (row: ProfileWorkspaceRow) => void;
  readonly onAskJovie?: (row: ProfileWorkspaceRow) => void;
  readonly onEditProfile?: (row: ProfileWorkspaceRow) => void;
  /** Present only when the row has a fixable issue (never a dead end). */
  readonly onFix?: (row: ProfileWorkspaceRow) => void;
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

  if (callbacks.onAskJovie) {
    const { onAskJovie } = callbacks;
    items.unshift({
      id: 'ask-jovie',
      label: 'Ask Jovie',
      icon: <MessageCircle className='h-3.5 w-3.5' aria-hidden />,
      onClick: () => onAskJovie(row),
    });
  }

  if (
    row.rowType === 'surface' &&
    row.kind === 'jovie' &&
    callbacks.onEditProfile
  ) {
    const { onEditProfile } = callbacks;
    items.unshift({
      id: 'edit-profile',
      label: 'Edit Profile',
      icon: <Pencil className='h-3.5 w-3.5' aria-hidden />,
      onClick: () => onEditProfile(row),
    });
  }

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

  if (callbacks.onFix) {
    const { onFix } = callbacks;
    items.push({
      id: 'connection-fix',
      label: 'Fix With Jovie',
      icon: <Wrench className='h-3.5 w-3.5' aria-hidden />,
      onClick: () => onFix(row),
    });
  }

  if (
    row.rowType === 'surface' &&
    row.kind !== 'jovie' &&
    !row.id.startsWith('preview:') &&
    row.removalTarget &&
    callbacks.onRemoveLink
  ) {
    const { onRemoveLink } = callbacks;
    items.push(
      { type: 'separator' },
      {
        id: 'remove-profile-link',
        label: 'Remove From Jovie Profile',
        icon: <Trash2 className='h-3.5 w-3.5' aria-hidden />,
        destructive: true,
        onClick: () => onRemoveLink(row),
      }
    );
  }
  return items;
}

export function kindLabel(row: ProfileWorkspaceRow): string {
  const labels = {
    jovie: 'Jovie',
    website: 'Website',
    social: 'Social',
    dsp: 'DSP',
    authority: 'Source',
    connector: 'Connector',
  } as const;
  return labels[row.kind];
}
