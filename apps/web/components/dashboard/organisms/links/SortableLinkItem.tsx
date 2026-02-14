'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SwipeToReveal } from '@/components/atoms/SwipeToReveal';
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

const SWIPE_ACTION_CLASS =
  'flex h-full flex-col items-center justify-center gap-1 px-4 text-white text-xs font-medium transition-colors active:opacity-80';

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
  readonly id: string;
  /** The link data to display */
  readonly link: T;
  /** Index of the link in the parent array (for handlers) */
  readonly index: number;
  /** Handler for toggling link visibility */
  readonly onToggle: (idx: number) => void;
  /** Handler for removing a link */
  readonly onRemove: (idx: number) => void;
  /** Handler for editing a link */
  readonly onEdit: (idx: number) => void;
  /** Whether the link is currently visible */
  readonly visible: boolean;
  /** Whether drag-and-drop is enabled for this item */
  readonly draggable?: boolean;
  /** ID of the currently open menu (for mutual exclusion) */
  readonly openMenuId: string | null;
  /** Callback when any menu opens/closes */
  readonly onAnyMenuOpen: (id: string | null) => void;
  /** Whether this link was just added (for highlight animation) */
  readonly isLastAdded: boolean;
  /** Function to build the primary label for the pill */
  readonly buildPillLabel: (link: DetectedLink) => string;
}

/**
 * SortableLinkItem - A draggable row component for link items in the links manager.
 *
 * This component wraps LinkPill with dnd-kit sortable functionality and provides:
 * - Drag-and-drop reordering within sections
 * - Action menu (edit, toggle visibility, delete)
 * - Visual states (connected, hidden, error, loading)
 * - Highlight animation for newly added links
 * - Mobile swipe-to-reveal actions (edit, toggle, delete)
 *
 * Uses React.memo for performance optimization since the component is rendered
 * multiple times in a list and receives stable callbacks from the parent.
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

  const swipeActions = (
    <>
      <button
        type='button'
        onClick={() => onEdit(index)}
        className={cn(SWIPE_ACTION_CLASS, 'bg-blue-500')}
        aria-label={`Edit ${link.platform.name || link.platform.id}`}
      >
        <Icon name='Pencil' className='h-4 w-4' />
        <span>Edit</span>
      </button>
      <button
        type='button'
        onClick={() => onToggle(index)}
        className={cn(SWIPE_ACTION_CLASS, 'bg-gray-500')}
        aria-label={visible ? 'Hide link' : 'Show link'}
      >
        <Icon name={visible ? 'EyeOff' : 'Eye'} className='h-4 w-4' />
        <span>{visible ? 'Hide' : 'Show'}</span>
      </button>
      <button
        type='button'
        onClick={() => onRemove(index)}
        className={cn(SWIPE_ACTION_CLASS, 'bg-red-500')}
        aria-label={`Delete ${link.platform.name || link.platform.id}`}
      >
        <Icon name='Trash' className='h-4 w-4' />
        <span>Delete</span>
      </button>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn('relative')}
      style={cardStyle}
      {...listeners}
    >
      <SwipeToReveal
        itemId={id}
        actions={swipeActions}
        actionsWidth={180}
        className='rounded-2xl'
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
      </SwipeToReveal>

      {/* Screen reader accessible URL display */}
      <div className='sr-only'>{urlDisplay}</div>
    </div>
  );
}) as <T extends DetectedLink = DetectedLink>(
  props: SortableLinkItemProps<T>
) => React.ReactElement;
