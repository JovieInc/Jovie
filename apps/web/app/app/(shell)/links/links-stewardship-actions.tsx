'use client';

import { ExternalLink, Link2, Share2 } from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { getUTMShareContextMenuItems } from '@/lib/utm/share-menu-items';
import type { LinkRow } from './links-model';
import { buildLinksUtmContext } from './links-tracked';

const ICON_TRACKED = <Share2 className='h-3.5 w-3.5' aria-hidden='true' />;
const ICON_LINK = <Link2 className='h-3.5 w-3.5' aria-hidden='true' />;
const ICON_OPEN = <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />;

/** Primary one-action id shared by row, ellipsis, and right-rail consumers. */
export const LINKS_COPY_TRACKED_ACTION_ID = 'copy-tracked-link' as const;

export interface BuildLinksStewardshipActionsCallbacks {
  /** One-tap tracked copy — create → copy → measure spine. */
  readonly onCopyTracked: (row: LinkRow) => void;
  /** Clean Jovie URL without minting campaign UTMs. */
  readonly onCopyLink: (row: LinkRow) => void;
  readonly onOpenEntity?: (row: LinkRow) => void;
}

/**
 * Canonical Links stewardship action registry.
 *
 * Same contract as profiles `buildConnectionActions` / library entity actions:
 * one builder feeds the row context menu, ellipsis overflow, and right-rail
 * menu so those entry points cannot drift.
 */
export function buildLinksStewardshipActions(
  row: LinkRow,
  callbacks: BuildLinksStewardshipActionsCallbacks
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [
    {
      id: LINKS_COPY_TRACKED_ACTION_ID,
      label: 'Copy Tracked Link',
      icon: ICON_TRACKED,
      onClick: () => callbacks.onCopyTracked(row),
    },
    {
      id: 'copy-link',
      label: 'Copy Link',
      icon: ICON_LINK,
      onClick: () => callbacks.onCopyLink(row),
    },
    ...getUTMShareContextMenuItems({
      smartLinkUrl: row.jovieUrl,
      context: buildLinksUtmContext(row),
    }),
  ];

  if (row.entityHref && callbacks.onOpenEntity) {
    const { onOpenEntity } = callbacks;
    items.push(
      { type: 'separator' },
      {
        id: 'open-entity',
        label: 'Open Entity',
        icon: ICON_OPEN,
        onClick: () => onOpenEntity(row),
      }
    );
  }

  return items;
}

type LinksStewardshipAction = Extract<
  ContextMenuItemType,
  { readonly id: string; readonly onClick: () => void }
>;

/** Locate the primary copy/share action inside a stewardship menu. */
export function findLinksCopyTrackedAction(
  items: readonly ContextMenuItemType[]
): LinksStewardshipAction | undefined {
  const match = items.find(
    (item): item is LinksStewardshipAction =>
      'id' in item &&
      item.id === LINKS_COPY_TRACKED_ACTION_ID &&
      'onClick' in item
  );
  return match;
}
