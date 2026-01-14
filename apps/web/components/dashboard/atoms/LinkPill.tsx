'use client';

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
import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  geistTableMenuContentClass,
  geistTableMenuDestructiveItemClass,
  geistTableMenuItemClass,
} from '@/lib/ui/geist-table-menu';
import { cn } from '@/lib/utils';

export type LinkPillState =
  | 'connected'
  | 'ready'
  | 'error'
  | 'hidden'
  | 'loading';

export type LinkPillMenuItem = {
  id: string;
  label: string;
  iconName?: string;
  variant?: 'default' | 'destructive';
  onSelect: () => void;
};

export interface LinkPillProps {
  platformIcon: string;
  platformName: string;
  primaryText: string;
  secondaryText?: string;
  state: LinkPillState;
  badgeText?: string;
  shimmerOnMount?: boolean;
  menuItems: LinkPillMenuItem[];
  menuId: string;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  className?: string;
}

export function LinkPill({
  platformIcon,
  platformName,
  primaryText,
  secondaryText,
  state,
  badgeText,
  shimmerOnMount,
  menuItems,
  menuId,
  isMenuOpen,
  onMenuOpenChange,
  className,
}: LinkPillProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const open = isMenuOpen ?? openInternal;

  const {
    refs: floatingRefs,
    floatingStyles,
    context,
  } = useFloating({
    open,
    onOpenChange: (nextOpen: boolean) => setOpen(nextOpen),
    placement: 'bottom-end',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const { setReference: setReferenceRef, setFloating: setFloatingRef } =
    floatingRefs;

  const click = useClick(context, { toggle: true });
  const dismiss = useDismiss(context, { outsidePressEvent: 'pointerdown' });
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role]
  );

  const setOpen = useCallback(
    (next: boolean) => {
      onMenuOpenChange(next);
      setOpenInternal(next);
    },
    [onMenuOpenChange]
  );

  const menuButtonAria = `Open actions for ${platformName}`;
  const initialFocusTarget =
    menuItems.length > 0 ? firstItemRef : floatingRefs.floating;

  const trailing = (
    <button
      type='button'
      aria-label={menuButtonAria}
      ref={setReferenceRef}
      className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-2/30 text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:scale-[0.97] -mr-2'
      {...getReferenceProps()}
    >
      <Icon name='MoreHorizontal' className='h-5 w-5 opacity-90' />
    </button>
  );

  return (
    <>
      <PlatformPill
        platformIcon={platformIcon}
        platformName={platformName}
        primaryText={primaryText}
        secondaryText={secondaryText}
        state={state}
        badgeText={badgeText}
        shimmerOnMount={shimmerOnMount}
        trailing={trailing}
        className={className}
        testId={`link-pill-${menuId}`}
      />

      {open ? (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal
            initialFocus={initialFocusTarget}
          >
            <div
              ref={setFloatingRef}
              tabIndex={-1}
              style={floatingStyles}
              className={cn('z-100 min-w-[176px]', geistTableMenuContentClass)}
              {...getFloatingProps()}
            >
              {menuItems.map((item, index) => (
                <button
                  key={item.id}
                  type='button'
                  ref={index === 0 ? firstItemRef : undefined}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    geistTableMenuItemClass,
                    'w-full text-left active:scale-[0.98]',
                    item.variant === 'destructive'
                      ? geistTableMenuDestructiveItemClass
                      : null
                  )}
                  {...getItemProps()}
                >
                  {item.iconName ? (
                    <Icon
                      name={item.iconName}
                      className='h-4 w-4 shrink-0 opacity-80'
                    />
                  ) : null}
                  <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}
