'use client';

import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';
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
  [
    // Base layout — 13px / weight 510 / 6px radius matching Linear
    'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-[6px] px-1.5 text-left text-app leading-tight outline-none',
    // Font weight 510 — Linear's exact sidebar nav weight
    '[font-weight:var(--font-weight-nav)]',
    // Transitions — Linear: 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)
    'transition-[background-color,color] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
    // Default text color - muted sidebar tokens matching Linear
    'text-sidebar-item-foreground',
    // Hover state — Linear: rgba(255,255,255,0.02) bg
    'hover:bg-sidebar-accent',
    // Active state — Linear: rgba(255,255,255,0.06) bg, brighter text
    'data-[active=true]:bg-sidebar-accent-active data-[active=true]:text-sidebar-foreground',
    // Focus state - subtle bg like Linear (no rings)
    'focus-visible:bg-sidebar-accent focus-visible:outline-none',
    // Disabled state
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    // Menu action spacing
    'group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 group-has-[[data-sidebar=menu-actions]]/menu-item:pr-14',
    // Collapsed icon mode
    'group-data-[collapsible=icon]:!w-(--sidebar-width-icon) group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:justify-center',
    // Text truncation in collapsed mode
    '[&>span:last-child]:truncate [&>span:last-child]:transition-opacity [&>span:last-child]:duration-150',
    'group-data-[collapsible=icon]:[&>span:last-child]:opacity-0 group-data-[collapsible=icon]:[&>span:not(.sr-only)]:hidden',
    // Icon styling — 14px icons matching Linear
    '[&>[data-sidebar-icon]]:flex [&>[data-sidebar-icon]]:size-3.5 [&>[data-sidebar-icon]]:shrink-0 [&>[data-sidebar-icon]]:items-center [&>[data-sidebar-icon]]:justify-center',
    '[&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-item-icon [&>svg]:transition-colors [&>svg]:duration-150',
    '[&_[data-sidebar-icon]_svg]:text-sidebar-item-icon [&_[data-sidebar-icon]_svg]:transition-colors [&_[data-sidebar-icon]_svg]:duration-150',
    'hover:[&>svg]:text-sidebar-item-icon',
    'hover:[&_[data-sidebar-icon]_svg]:text-sidebar-item-icon',
    'data-[active=true]:[&>svg]:text-sidebar-item-icon',
    'data-[active=true]:[&_[data-sidebar-icon]_svg]:text-sidebar-item-icon',
  ].join(' '),
  {
    variants: {
      variant: {
        default: '',
        outline:
          'bg-sidebar-background shadow-[0_0_0_1px_rgb(var(--sidebar-border))] hover:shadow-[0_0_0_1px_rgb(var(--sidebar-accent))]',
      },
      size: {
        default: 'min-h-7',
        sm: 'min-h-6 text-xs',
        lg: 'min-h-9 group-data-[collapsible=icon]:!size-9',
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

const SidebarMenuButtonInner = React.forwardRef<
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

    // Handle both string tooltips and custom tooltip content with children
    // Don't wrap custom children in <span> to preserve flex layout for Kbd components
    const tooltipContent =
      typeof tooltip === 'string' ? <span>{tooltip}</span> : tooltip.children;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side='right' align='center' hidden={isMobile}>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }
);
SidebarMenuButtonInner.displayName = 'SidebarMenuButton';

// Wrap with React.memo to prevent unnecessary re-renders when props haven't changed
export const SidebarMenuButton = React.memo(SidebarMenuButtonInner);
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
        'relative flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-item-icon outline-none transition-[background-color,color] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
        'hover:text-sidebar-foreground hover:bg-sidebar-accent',
        'focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground focus-visible:outline-none',
        '[&>svg]:size-3.5 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:lg:hidden',
        'peer-data-[active=true]/menu-button:text-sidebar-item-foreground',
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
      'absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-medium tabular-nums text-sidebar-item-icon select-none pointer-events-none',
      'peer-hover/menu-button:text-sidebar-item-foreground peer-data-[active=true]/menu-button:text-sidebar-item-foreground',
      'peer-data-[size=sm]/menu-button:text-[10px]',
      'peer-data-[size=default]/menu-button:text-[11px]',
      'peer-data-[size=lg]/menu-button:text-xs',
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
        'rounded-md h-7 flex gap-2 px-2 items-center transition-all duration-200 ease-out',
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
      'ml-4 flex min-w-0 flex-col gap-px border-l border-sidebar-border/60 pl-3 py-0.5',
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
        'flex min-h-6 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-[6px] px-1.5 text-app text-sidebar-item-foreground outline-none transition-[background-color,color] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
        'hover:bg-sidebar-accent hover:text-sidebar-foreground',
        'focus-visible:bg-sidebar-accent focus-visible:outline-none',
        'active:bg-sidebar-accent active:text-sidebar-foreground',
        'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        '[&>span:last-child]:truncate [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-item-icon [&>svg]:transition-colors',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:font-medium',
        'data-[active=true]:[&>svg]:text-sidebar-item-foreground hover:[&>svg]:text-sidebar-item-foreground',
        size === 'sm' && 'text-xs min-h-5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';
