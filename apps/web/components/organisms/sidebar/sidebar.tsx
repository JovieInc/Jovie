'use client';

import { Sheet, SheetContent } from '@jovie/ui';
import React from 'react';
import { cn } from '@/lib/utils';
import { useSidebar } from './context';

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  }
>(
  (
    {
      side = 'left',
      variant = 'sidebar',
      collapsible = 'offcanvas',
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === 'none') {
      return (
        <div
          className={cn(
            'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar='sidebar'
            data-mobile='true'
            className='w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden'
            style={
              {
                '--sidebar-width': '18rem',
              } as React.CSSProperties
            }
            side={side}
          >
            <div className='flex h-full w-full flex-col overflow-hidden'>
              {children}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className='group peer hidden shrink-0 overflow-hidden text-sidebar-foreground lg:sticky lg:top-0 lg:block'
        data-state={state}
        data-collapsible={state === 'closed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
      >
        <div
          className={cn(
            'duration-200 relative h-svh w-(--sidebar-width) overflow-hidden transition-[width] ease-out',
            'group-data-[collapsible=offcanvas]:w-0',
            'group-data-[side=right]:rotate-180',
            variant === 'floating' &&
              'px-2 py-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]',
            variant === 'inset' &&
              'px-2 py-0 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]',
            variant === 'sidebar' &&
              'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
            className
          )}
          {...props}
        >
          <div
            data-sidebar='sidebar'
            className='flex h-full w-full flex-col overflow-hidden bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow group-data-[variant=inset]:border-r group-data-[variant=inset]:border-sidebar-border'
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = 'Sidebar';
