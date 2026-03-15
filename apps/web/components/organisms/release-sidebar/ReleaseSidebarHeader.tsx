'use client';

/**
 * ReleaseSidebarHeader
 *
 * Provides title and action buttons for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 *
 * The overflow menu uses convertContextMenuItems to derive its items from
 * ContextMenuItemType[], ensuring the sidebar overflow always matches
 * the canonical action builder output.
 */

import { Check, Copy, MoreVertical, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { convertContextMenuItems } from '@/components/organisms/table/molecules/TableContextMenu';

import type { Release } from './types';

const DRAWER_HEADER_ICON_BUTTON_CLASSNAME =
  'h-[26px] w-[26px] border-transparent bg-transparent hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1)';

interface UseReleaseHeaderResult {
  title: ReactNode;
  actions: ReactNode | undefined;
}

interface UseReleaseHeaderPartsProps {
  readonly release: Release | null;
  readonly hasRelease: boolean;
  /** Canonical action menu items from buildReleaseActions — rendered in overflow */
  readonly contextMenuItems?: ContextMenuItemType[];
  readonly onClose?: () => void;
}

function buildTitleText(
  isrcValue: string | null | undefined,
  hasRelease: boolean,
  release: Release | null
): string {
  if (isrcValue) return isrcValue;
  if (hasRelease && release?.title) return release.title;
  return 'No release selected';
}

/**
 * Hook that returns the title and actions for the release sidebar header.
 * Designed for use with EntitySidebarShell's `title` and `headerActions` props.
 *
 * The overflow menu is derived from the canonical ContextMenuItemType[] so that
 * the sidebar header, sidebar right-click, and row right-click all show the same actions.
 */
export function useReleaseHeaderParts({
  release,
  hasRelease,
  contextMenuItems = [],
  onClose,
}: UseReleaseHeaderPartsProps): UseReleaseHeaderResult {
  const [isIdCopied, setIsIdCopied] = useState(false);
  const idCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
    };
  }, []);

  const isrcValue = hasRelease ? release?.primaryIsrc : undefined;
  const titleText = buildTitleText(isrcValue, hasRelease, release);

  const handleCopyIsrc = useCallback(async () => {
    if (!isrcValue) return;
    try {
      await navigator.clipboard?.writeText(isrcValue);
      setIsIdCopied(true);
      if (idCopyTimeoutRef.current) clearTimeout(idCopyTimeoutRef.current);
      idCopyTimeoutRef.current = setTimeout(() => setIsIdCopied(false), 2000);
    } catch {}
  }, [isrcValue]);

  const title = (
    <span className='group/isrc flex min-w-0 items-center gap-1'>
      <span className='truncate font-mono text-[11.5px] tracking-[0.04em] text-(--linear-text-tertiary)'>
        {titleText}
      </span>
      {isrcValue && (
        <DrawerInlineIconButton
          onClick={handleCopyIsrc}
          title={isIdCopied ? 'Copied!' : 'Copy ISRC'}
          fadeOnParentHover
          className='group-hover/isrc:opacity-100 group-focus-within/isrc:opacity-100'
        >
          {isIdCopied ? (
            <Check className='h-3 w-3' />
          ) : (
            <Copy className='h-3 w-3' />
          )}
        </DrawerInlineIconButton>
      )}
    </span>
  );

  // Convert canonical context menu items to overflow menu format
  const overflowMenuItems: TableActionMenuItem[] =
    convertContextMenuItems(contextMenuItems);

  // Add close action if onClose provided
  const menuItems: TableActionMenuItem[] = onClose
    ? [
        ...overflowMenuItems,
        ...(overflowMenuItems.length > 0
          ? [{ id: 'separator', label: '' }]
          : []),
        {
          id: 'close-drawer',
          label: 'Close',
          icon: X,
          onClick: onClose,
        },
      ]
    : overflowMenuItems;

  const actions =
    menuItems.length > 0 ? (
      <div className='flex items-center gap-0.5'>
        <TableActionMenu items={menuItems} trigger='custom' align='end'>
          <AppIconButton
            className={`${DRAWER_HEADER_ICON_BUTTON_CLASSNAME} text-(--linear-text-tertiary)`}
            ariaLabel='More actions'
          >
            <MoreVertical className='h-3.5 w-3.5' aria-hidden='true' />
          </AppIconButton>
        </TableActionMenu>
      </div>
    ) : undefined;

  return { title, actions };
}
