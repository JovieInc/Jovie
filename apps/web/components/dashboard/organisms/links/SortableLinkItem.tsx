'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import {
  LinkPill,
  type LinkPillMenuItem,
  type LinkPillState,
} from '@/components/dashboard/atoms/LinkPill';
import { cn } from '@/lib/utils';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import { compactUrlDisplay } from './utils';

/**
 * Determine the pill state based on visibility and validity.
 */
function getPillState(
  visible: boolean,
  isValid: boolean | undefined
): LinkPillState {
  if (!visible) return 'hidden';
  if (isValid === false) return 'error';
  return 'connected';
}

/**
 * Determine the badge text based on visibility, state, and recency.
 */
function getBadgeText(
  visible: boolean,
  pillState: LinkPillState,
  isLastAdded: boolean
): string | undefined {
  if (!visible) return 'Hidden';
  if (pillState === 'error') return 'Needs fix';
  if (isLastAdded) return 'New';
  return undefined;
}

/**
 * Props for the SortableLinkItem component
 */
export interface SortableLinkItemProps<T extends DetectedLink = DetectedLink> {
  /** Unique identifier for DnD and menu control */
  id: string;
  /** The link data to display */
  link: T;
  /** Index of the link in the parent array (for handlers) */
  index: number;
  /** Handler for toggling link visibility */
  onToggle: (idx: number) => void;
  /** Handler for removing a link */
  onRemove: (idx: number) => void;
  /** Handler for editing a link */
  onEdit: (idx: number) => void;
  /** Whether the link is currently visible */
  visible: boolean;
  /** Whether drag-and-drop is enabled for this item */
  draggable?: boolean;
  /** ID of the currently open menu (for mutual exclusion) */
  openMenuId: string | null;
  /** Callback when any menu opens/closes */
  onAnyMenuOpen: (id: string | null) => void;
  /** Whether this link was just added (for highlight animation) */
  isLastAdded: boolean;
  /** Function to build the primary label for the pill */
  buildPillLabel: (link: DetectedLink) => string;
}

/**
 * SortableLinkItem - A draggable row component for link items in the links manager.
 *
 * This component wraps LinkPill with dnd-kit sortable functionality and provides:
 * - Drag-and-drop reordering within sections
 * - Action menu (edit, toggle visibility, delete)
 * - Visual states (connected, hidden, error, loading)
 * - Highlight animation for newly added links
 *
 * Uses React.memo for performance optimization since the component is rendered
 * multiple times in a list and receives stable callbacks from the parent.
 *
 * @example
 * ```tsx
 * <SortableLinkItem
 *   id={linkId}
 *   link={link}
 *   index={0}
 *   onToggle={handleToggle}
 *   onRemove={handleRemove}
 *   onEdit={handleEdit}
 *   visible={true}
 *   draggable={true}
 *   openMenuId={openMenuId}
 *   onAnyMenuOpen={handleAnyMenuOpen}
 *   isLastAdded={false}
 *   buildPillLabel={buildPillLabel}
 * />
 * ```
 */
export const SortableLinkItem = React.memo(function SortableLinkItem<
  T extends DetectedLink = DetectedLink,
>({
  id,
  link,
  index,
  onToggle,
  onRemove,
  onEdit,
  visible,
  draggable = true,
  openMenuId,
  onAnyMenuOpen,
  isLastAdded,
  buildPillLabel,
}: SortableLinkItemProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: !draggable,
    });

  // Reserved for future drag handle pointer down handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleDragHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (listeners?.onPointerDown) {
        listeners.onPointerDown(e);
      }
    },
    [listeners]
  );

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const urlDisplay = compactUrlDisplay(link.platform.id, link.normalizedUrl);
  const identity = canonicalIdentity(link);
  const secondaryText = identity.startsWith('@') ? identity : undefined;

  const pillState = getPillState(visible, link.isValid);
  const badgeText = getBadgeText(visible, pillState, isLastAdded);

  const menuItems: LinkPillMenuItem[] = [
    {
      id: 'edit',
      label: 'Edit',
      iconName: 'Pencil',
      onSelect: () => onEdit(index),
    },
    {
      id: 'toggle',
      label: visible ? 'Hide' : 'Show',
      iconName: visible ? 'EyeOff' : 'Eye',
      onSelect: () => onToggle(index),
    },
    {
      id: 'delete',
      label: 'Delete',
      iconName: 'Trash',
      variant: 'destructive',
      onSelect: () => onRemove(index),
    },
  ];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn('relative')}
      style={cardStyle}
      {...listeners}
    >
      <LinkPill
        platformIcon={link.platform.icon}
        platformName={link.platform.name || link.platform.id}
        primaryText={buildPillLabel(link)}
        secondaryText={secondaryText}
        state={pillState}
        badgeText={badgeText}
        shimmerOnMount={isLastAdded}
        menuItems={menuItems}
        menuId={id}
        isMenuOpen={openMenuId === id}
        onMenuOpenChange={next => onAnyMenuOpen(next ? id : null)}
        className='max-w-full'
      />

      {/* Screen reader accessible URL display */}
      <div className='sr-only'>{urlDisplay}</div>
    </div>
  );
}) as <T extends DetectedLink = DetectedLink>(
  props: SortableLinkItemProps<T>
) => React.ReactElement;
