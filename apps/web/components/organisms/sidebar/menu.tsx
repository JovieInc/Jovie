'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';
import { Skeleton } from '@/components/atoms/Skeleton';
import { cn } from '@/lib/utils';
import { useSidebar } from './context';

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar='menu'
    className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
    {...props}
  />
));
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<'li'>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar='menu-item'
    className={cn('group/menu-item relative', className)}
    {...props}
  />
));
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-1.5 overflow-hidden rounded-md px-2 py-1 text-left text-xs tracking-tight font-normal leading-5 outline-none ring-sidebar-ring transition-all duration-150 ease-out text-sidebar-muted hover:text-sidebar-foreground focus-visible:ring-2 data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 group-has-[[data-sidebar=menu-actions]]/menu-item:pr-14 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[state=open]:hover:bg-sidebar-accent active:duration-50 active:ease-out group-data-[collapsible=icon]:!w-(--sidebar-width-icon) group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:justify-center [&>span:last-child]:truncate [&>span:last-child]:transition-opacity [&>span:last-child]:duration-150 group-data-[collapsible=icon]:[&>span:last-child]:opacity-0 group-data-[collapsible=icon]:[&>span:not(.sr-only)]:hidden [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-muted [&>svg]:transition-colors [&>svg]:duration-150 hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
      size: {
        default: 'h-7',
        sm: 'h-6 text-xs',
        lg: 'h-8 group-data-[collapsible=icon]:!size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type SidebarMenuButtonVariant = 'default' | 'outline';
type SidebarMenuButtonSize = 'default' | 'sm' | 'lg';

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
    variant?: SidebarMenuButtonVariant;
    size?: SidebarMenuButtonSize;
  }
>(
  (
    {
      asChild = false,
      isActive = false,
      variant = 'default',
      size = 'default',
      tooltip,
      className,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const { isMobile } = useSidebar();

    const button = (
      <Comp
        ref={ref}
        data-sidebar='menu-button'
        data-size={size}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
        type={asChild ? undefined : 'button'}
        {...props}
      />
    );

    if (!tooltip) {
      return button;
    }

    if (typeof tooltip === 'string') {
      tooltip = {
        children: tooltip,
      };
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side='right'
          align='center'
          hidden={isMobile}
          showArrow={false}
          {...tooltip}
        />
      </Tooltip>
    );
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export const SidebarMenuActions = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    showOnHover?: boolean;
  }
>(({ className, showOnHover = false, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar='menu-actions'
    className={cn(
      'absolute right-1 top-1 flex items-center gap-1',
      'peer-data-[size=sm]/menu-button:top-0.5',
      'peer-data-[size=default]/menu-button:top-1',
      'peer-data-[size=lg]/menu-button:top-2',
      'group-data-[collapsible=icon]:hidden',
      showOnHover &&
        'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 group-focus-within/menu-item:pointer-events-auto group-hover/menu-item:pointer-events-auto lg:pointer-events-none lg:opacity-0',
      className
    )}
    {...props}
  />
));
SidebarMenuActions.displayName = 'SidebarMenuActions';

export const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    asChild?: boolean;
  }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-action'
      className={cn(
        'relative flex aspect-square w-4 items-center justify-center rounded-md p-0 text-sidebar-muted/60 outline-none ring-sidebar-ring transition-colors duration-150 ease-out hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:text-sidebar-foreground [&>svg]:size-3.5 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:lg:hidden',
        'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        className
      )}
      {...props}
    />
  );
});
SidebarMenuAction.displayName = 'SidebarMenuAction';

export const SidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar='menu-badge'
    className={cn(
      'absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none',
      'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
      'peer-data-[size=sm]/menu-button:text-xs',
      'peer-data-[size=default]/menu-button:text-xs',
      'peer-data-[size=lg]/menu-button:text-sm',
      'group-data-[collapsible=icon]:hidden',
      className
    )}
    {...props}
  />
));
SidebarMenuBadge.displayName = 'SidebarMenuBadge';

export const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar='menu-skeleton'
      className={cn(
        'rounded-md h-10 flex gap-2 px-3 items-center transition-all duration-200 ease-out',
        'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center',
        className
      )}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className='size-5 rounded-md shrink-0'
          data-sidebar='menu-skeleton-icon'
        />
      )}
      <Skeleton
        className='h-4 flex-1 max-w-[--skeleton-width] transition-opacity duration-200 group-data-[collapsible=icon]:hidden'
        data-sidebar='menu-skeleton-text'
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </div>
  );
});
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton';

export const SidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar='menu-sub'
    className={cn(
      'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
      'group-data-[collapsible=icon]:hidden',
      className
    )}
    {...props}
  />
));
SidebarMenuSub.displayName = 'SidebarMenuSub';

export const SidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<'li'>
>(({ ...props }, ref) => <li ref={ref} {...props} />);
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem';

export const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<'a'> & {
    asChild?: boolean;
    size?: 'sm' | 'md';
    isActive?: boolean;
  }
>(({ asChild = false, size = 'md', isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-sub-button'
      data-size={size}
      data-active={isActive}
      className={cn(
        'flex h-6 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-muted outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-muted [&>svg]:transition-colors',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground hover:[&>svg]:text-sidebar-foreground',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';
