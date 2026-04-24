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
    className={cn('flex w-full min-w-0 flex-col gap-px', className)}
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
    // Base layout — tighter and calmer so the rail reads as one system.
    'peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-[10px] border border-transparent px-2.5 text-left text-[12.5px] leading-[1.15] tracking-normal outline-none',
    // Font weight 500 — Linear's --font-weight-medium for sidebar nav
    '[font-weight:var(--font-weight-nav)]',
    // Transitions — Linear: instant for background, colors
    'transition-[background-color,border-color,color,box-shadow] duration-fast ease-interactive',
    // Default text color — token-driven contrast, no extra opacity dampening
    'text-sidebar-item-foreground',
    // Hover state — Linear: rgba(255,255,255,0.02) bg
    'hover:border-[color-mix(in_oklab,var(--linear-app-frame-seam)_58%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-sidebar-accent)_82%,transparent)] hover:text-sidebar-item-foreground',
    // Active state — soft emphasis while keeping shell understated
    'data-[active=true]:border-[color-mix(in_oklab,var(--linear-app-frame-seam)_80%,transparent)] data-[active=true]:bg-[color-mix(in_oklab,var(--color-sidebar-accent-active)_88%,var(--linear-app-content-surface))] data-[active=true]:text-sidebar-item-foreground data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),inset_0_0_0_1px_color-mix(in_oklab,var(--linear-app-frame-seam)_62%,transparent)]',
    // Focus state - subtle bg like Linear (no rings)
    'focus-visible:border-[color-mix(in_oklab,var(--linear-border-focus)_62%,transparent)] focus-visible:bg-sidebar-accent focus-visible:outline-none',
    // Disabled state
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    // Menu action spacing
    'group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 group-has-[[data-sidebar=menu-actions]]/menu-item:pr-14',
    // Collapsed icon mode
    'group-data-[collapsible=icon]:!w-(--sidebar-width-icon) group-data-[collapsible=icon]:!h-7 group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:justify-center',
    // Text truncation in collapsed mode
    '[&>span:last-child]:truncate [&>span:last-child]:transition-opacity [&>span:last-child]:duration-normal [&>span:last-child]:ease-interactive',
    'group-data-[collapsible=icon]:[&>span:last-child]:opacity-0 group-data-[collapsible=icon]:[&>span:not(.sr-only)]:hidden',
    // Icon styling — 14px to match Linear's nav icon size
    '[&>[data-sidebar-icon]]:flex [&>[data-sidebar-icon]]:size-3.5 [&>[data-sidebar-icon]]:shrink-0 [&>[data-sidebar-icon]]:items-center [&>[data-sidebar-icon]]:justify-center',
    '[&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-item-icon [&>svg]:transition-colors [&>svg]:duration-0 [&>svg]:ease-interactive',
    '[&_[data-sidebar-icon]_svg]:text-sidebar-item-icon [&_[data-sidebar-icon]_svg]:transition-colors [&_[data-sidebar-icon]_svg]:duration-0 [&_[data-sidebar-icon]_svg]:ease-interactive',
    'hover:[&>svg]:text-sidebar-item-foreground',
    'hover:[&_[data-sidebar-icon]_svg]:text-sidebar-item-foreground',
    'data-[active=true]:[&>svg]:text-sidebar-item-foreground',
    'data-[active=true]:[&_[data-sidebar-icon]_svg]:text-sidebar-item-foreground',
  ].join(' '),
  {
    variants: {
      variant: {
        default: '',
        outline:
          'bg-sidebar-background border border-sidebar-border hover:border-sidebar-accent',
      },
      size: {
        default: 'h-6.5',
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
        <TooltipContent
          side='right'
          align='center'
          hidden={isMobile}
          className={
            typeof tooltip === 'string' ? undefined : 'flex items-center'
          }
        >
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
      'absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1',
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
        'relative flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-item-icon outline-none transition-[background-color,color] duration-normal ease-interactive',
        'hover:text-sidebar-foreground hover:bg-sidebar-accent',
        'focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground focus-visible:outline-none',
        '[&>svg]:size-3 [&>svg]:shrink-0',
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
      'absolute right-2 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-sidebar-accent/45 px-1.5 text-2xs font-medium tabular-nums text-sidebar-item-icon select-none pointer-events-none',
      'peer-hover/menu-button:text-sidebar-item-foreground peer-data-[active=true]/menu-button:text-sidebar-item-foreground',
      'peer-data-[size=sm]/menu-button:text-[10px]',
      'peer-data-[size=default]/menu-button:text-2xs',
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
    return `${Math.floor(Math.random() * 40) + 50}%`; // NOSONAR (S2245) - Non-security use: UI skeleton loading width randomization
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar='menu-skeleton'
      className={cn(
        'rounded-md h-7 flex gap-2 px-2 items-center transition-all duration-normal ease-interactive',
        'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center',
        className
      )}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className='size-3 rounded-md shrink-0'
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
        'flex min-h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-full px-2.5 text-app leading-[1.15] text-sidebar-item-foreground outline-none transition-[background-color,color,box-shadow] duration-normal ease-interactive [font-weight:var(--font-weight-nav)]',
        'hover:bg-sidebar-accent hover:text-sidebar-item-foreground',
        'focus-visible:bg-sidebar-accent focus-visible:outline-none',
        'active:bg-sidebar-accent active:text-sidebar-item-foreground',
        'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        '[&>span:last-child]:truncate [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-item-icon [&>svg]:transition-colors',
        'data-[active=true]:bg-sidebar-accent-active data-[active=true]:text-sidebar-item-foreground data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-app-frame-seam)_82%,transparent)]',
        'data-[active=true]:[&>svg]:text-sidebar-item-foreground hover:[&>svg]:text-sidebar-item-foreground',
        size === 'sm' && 'min-h-6 text-[12px]',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';
