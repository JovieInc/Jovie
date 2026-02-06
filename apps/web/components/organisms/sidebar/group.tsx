'use client';

import { Slot } from '@radix-ui/react-slot';
import React from 'react';
import { cn } from '@/lib/utils';

export const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar='group'
      className={cn(
        'relative flex w-full min-w-0 flex-col py-1 transition-all duration-200 ease-out',
        'group-data-[collapsible=icon]:px-0',
        className
      )}
      {...props}
    />
  );
});
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'div';

  return (
    <Comp
      ref={ref}
      data-sidebar='group-label'
      className={cn(
        'flex h-7 shrink-0 items-center rounded-md px-2 text-[12px] font-medium text-sidebar-item-icon outline-none transition-all duration-200 ease-out focus-visible:bg-sidebar-accent [&>svg]:size-3.5 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0',
        className
      )}
      {...props}
    />
  );
});
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      data-sidebar='group-action'
      className={cn(
        'absolute right-2 top-2 flex aspect-square w-4 items-center justify-center rounded-md p-0 text-sidebar-item-icon outline-none transition-transform hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent [&>svg]:size-3.5 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:lg:hidden',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
});
SidebarGroupAction.displayName = 'SidebarGroupAction';

export const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar='group-content'
    className={cn('w-full text-sm', className)}
    {...props}
  />
));
SidebarGroupContent.displayName = 'SidebarGroupContent';
