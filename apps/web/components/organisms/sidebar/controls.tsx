'use client';

import { Button, Kbd } from '@jovie/ui';
import { PanelLeft } from 'lucide-react';
import React from 'react';
import { SIDEBAR_KEYBOARD_SHORTCUT } from '@/hooks/useSidebarKeyboardShortcut';
import { cn } from '@/lib/utils';
import { useSidebar } from './context';

export const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentProps<typeof Button>, 'children'> & {
    children?: React.ReactNode;
  }
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      toggleSidebar();
    },
    [onClick, toggleSidebar]
  );

  return (
    <Button
      ref={ref}
      data-sidebar='trigger'
      variant='ghost'
      size='icon'
      className={cn(
        'h-7 w-7 outline-none ring-sidebar-ring focus-visible:ring-2',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <PanelLeft className='h-4 w-4' />
      <span className='sr-only'>Toggle Sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

type SidebarShortcutHintProps = {
  className?: string;
};

export function SidebarShortcutHint({ className }: SidebarShortcutHintProps) {
  return (
    <Kbd variant='tooltip' className={className}>
      ⌘/Ctrl {SIDEBAR_KEYBOARD_SHORTCUT.toUpperCase()}
    </Kbd>
  );
}

export const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'>
>(({ className, ...props }, ref) => {
  const { toggleSidebar, state } = useSidebar();

  return (
    <button
      ref={ref}
      data-sidebar='rail'
      aria-label='Toggle Sidebar'
      aria-expanded={state === 'open'}
      aria-pressed={state === 'open'}
      type='button'
      onClick={toggleSidebar}
      title='Toggle Sidebar'
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-out after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        'in-data-[side=left][data-state=closed]:cursor-e-resize in-data-[side=right][data-state=closed]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar',
        'in-data-[side=left][data-collapsible=offcanvas]:-right-2',
        'in-data-[side=right][data-collapsible=offcanvas]:-left-2',
        'outline-none ring-sidebar-ring focus-visible:ring-2 focus-visible:ring-offset-0',
        className
      )}
      {...props}
    />
  );
});
SidebarRail.displayName = 'SidebarRail';
