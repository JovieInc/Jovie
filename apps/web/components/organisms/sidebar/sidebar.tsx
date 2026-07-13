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

    // Always render Sheet to maintain consistent hook count (Radix UI uses internal hooks)
    // Control visibility via open prop instead of conditional rendering
    return (
      <>
        {/* Mobile Sheet - always in tree, visibility controlled by open prop */}
        <Sheet
          open={isMobile && openMobile}
          onOpenChange={setOpenMobile}
          {...props}
        >
          <SheetContent
            data-sidebar='sidebar'
            data-mobile='true'
            className='w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden'
            style={
              {
                '--sidebar-width': 'var(--linear-app-sidebar-width)',
              } as React.CSSProperties
            }
            side={side}
          >
            <div className='flex h-full w-full flex-col overflow-hidden'>
              {children}
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop Sidebar - always in tree so SSR and first client render match.
            `h-full` is load-bearing: the peer is not itself a flex child of the
            app-shell body (it sits inside app-shell-sidebar-mount), so without
            an explicit height the inner `h-full flex-col` collapses to content
            size and footer `mt-auto` has nothing to push against (JOV-3960). */}
        <div
          ref={ref}
          className='group peer max-lg:hidden h-full min-h-0 shrink-0 overflow-visible text-sidebar-foreground lg:sticky lg:top-0 lg:z-10'
          data-state={state}
          data-collapsible={state === 'closed' ? collapsible : ''}
          data-variant={variant}
          data-side={side}
        >
          <div
            className={cn(
              'duration-cinematic relative h-full w-(--sidebar-width) overflow-hidden transition-[width,transform,opacity] ease-cinematic motion-reduce:transition-none',
              'group-data-[collapsible=offcanvas]:w-0',
              state === 'closed' &&
                collapsible === 'offcanvas' &&
                side === 'left' &&
                '-translate-x-[calc(100%+0.5rem)] opacity-0',
              state === 'closed' &&
                collapsible === 'offcanvas' &&
                side === 'right' &&
                'translate-x-[calc(100%+0.5rem)] opacity-0',
              'group-data-[side=right]:rotate-180',
              // Prevent pointer events from leaking into content area during width transition
              'group-data-[collapsible=icon]:pointer-events-none',
              variant === 'floating' &&
                'px-2 py-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem+2px)]',
              variant === 'inset' &&
                'px-2 py-0 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem+2px)]',
              variant === 'sidebar' &&
                'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
              className
            )}
            {...props}
          >
            <div
              data-sidebar='sidebar'
              className='pointer-events-auto flex h-full w-full flex-col overflow-clip bg-sidebar transition-[background-color] duration-normal ease-interactive lg:rounded-(--linear-app-shell-radius) lg:shadow-(--linear-app-sidebar-shadow) group-data-[variant=floating]:rounded-sidebar-floating group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow group-data-[variant=inset]:border-r group-data-[variant=inset]:border-sidebar-border'
            >
              {children}
            </div>
          </div>
        </div>
      </>
    );
  }
);
Sidebar.displayName = 'Sidebar';
