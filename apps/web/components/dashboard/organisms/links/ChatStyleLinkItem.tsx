'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import {
  dropdownMenuContentClasses,
  MENU_ITEM_BASE,
  MENU_ITEM_DESTRUCTIVE,
} from '@jovie/ui';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import React, { useCallback, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { isBrandDark } from '@/lib/utils/color';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';

type LinkItemMenuItem = {
  id: string;
  label: string;
  iconName?: string;
  variant?: 'default' | 'destructive';
  onSelect: () => void;
};

export interface ChatStyleLinkItemProps<T extends DetectedLink = DetectedLink> {
  readonly id: string;
  readonly link: T;
  readonly index: number;
  readonly onToggle: (idx: number) => void;
  readonly onRemove: (idx: number) => void;
  readonly onEdit: (idx: number) => void;
  readonly visible: boolean;
  readonly draggable?: boolean;
  readonly openMenuId: string | null;
  readonly onAnyMenuOpen: (id: string | null) => void;
  readonly isLastAdded: boolean;
}

export const ChatStyleLinkItem = React.memo(function ChatStyleLinkItem<
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
}: ChatStyleLinkItemProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: !draggable,
    });

  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const isMenuOpen = openMenuId === id;

  const {
    refs: floatingRefs,
    floatingStyles,
    context,
  } = useFloating({
    open: isMenuOpen,
    onOpenChange: (nextOpen: boolean) => onAnyMenuOpen(nextOpen ? id : null),
    placement: 'bottom-end',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { toggle: true });
  const dismiss = useDismiss(context, { outsidePressEvent: 'pointerdown' });
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role]
  );

  const closeMenu = useCallback(() => {
    onAnyMenuOpen(null);
  }, [onAnyMenuOpen]);

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const identity = canonicalIdentity(link);
  const handle = identity.startsWith('@') ? identity : undefined;
  const iconMeta = getPlatformIconMetadata(link.platform.icon);
  const brandColor = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
  const isDark = isBrandDark(brandColor);

  const menuItems: LinkItemMenuItem[] = [
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
      style={cardStyle}
      className={cn(
        'flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3',
        'transition-all duration-200',
        !visible && 'opacity-50',
        isLastAdded && 'ring-2 ring-accent ring-offset-2 ring-offset-base'
      )}
    >
      {/* Drag handle */}
      {draggable && (
        <button
          type='button'
          className='cursor-grab text-tertiary-token hover:text-secondary-token active:cursor-grabbing'
          aria-label='Drag to reorder'
          {...listeners}
        >
          <GripVertical className='h-4 w-4' />
        </button>
      )}

      {/* Platform icon */}
      <div
        className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'
        style={{
          backgroundColor: brandColor,
          color: isDark ? '#ffffff' : '#0f172a',
        }}
      >
        <SocialIcon platform={link.platform.icon} className='h-5 w-5' />
      </div>

      {/* Content */}
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-primary-token'>
          {link.platform.name || link.platform.id}
        </div>
        {handle && (
          <div className='truncate text-sm text-secondary-token'>{handle}</div>
        )}
      </div>

      {/* Menu button */}
      <button
        type='button'
        aria-label={`Open actions for ${link.platform.name}`}
        ref={floatingRefs.setReference}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full',
          'text-secondary-token transition-colors',
          'hover:bg-surface-1 hover:text-primary-token',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        )}
        {...getReferenceProps()}
      >
        <MoreHorizontal className='h-4 w-4' />
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal
            initialFocus={firstItemRef}
          >
            <div
              ref={floatingRefs.setFloating}
              tabIndex={-1}
              style={floatingStyles}
              className={cn('z-100 min-w-[176px]', dropdownMenuContentClasses)}
              {...getFloatingProps()}
            >
              {menuItems.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type='button'
                  ref={itemIndex === 0 ? firstItemRef : undefined}
                  onClick={() => {
                    closeMenu();
                    item.onSelect();
                  }}
                  className={cn(
                    MENU_ITEM_BASE,
                    'w-full text-left active:scale-[0.98]',
                    item.variant === 'destructive' && MENU_ITEM_DESTRUCTIVE
                  )}
                  {...getItemProps()}
                >
                  {item.iconName && (
                    <Icon
                      name={item.iconName}
                      className='h-4 w-4 shrink-0 opacity-80'
                    />
                  )}
                  <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}) as <T extends DetectedLink = DetectedLink>(
  props: ChatStyleLinkItemProps<T>
) => React.ReactElement;
