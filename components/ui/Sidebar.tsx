'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  collapsed?: boolean;
  variant?: 'sidebar' | 'floating' | 'inset';
}

export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      collapsed = false,
      variant = 'sidebar',
      className = '',
      id,
      children,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      sidebar:
        'flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground',
      floating:
        'fixed left-4 top-4 z-40 h-[calc(100vh-2rem)] w-64 rounded-lg border bg-sidebar text-sidebar-foreground shadow-lg',
      inset:
        'flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground',
    };

    return (
      <div
        id={id}
        ref={ref}
        role='navigation'
        aria-label='Dashboard sidebar'
        className={cn(
          variantClasses[variant],
          collapsed ? 'lg:w-16' : '',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Sidebar.displayName = 'Sidebar';

export type SidebarSectionProps = React.HTMLAttributes<HTMLDivElement>;

export const SidebarHeader = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative flex h-16 shrink-0 items-center px-4 overflow-visible w-full',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarContent = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex grow flex-col gap-y-5 overflow-y-auto overflow-x-visible bg-surface-0 backdrop-blur-sm border-r border-subtle rounded-r-2xl shadow-md lg:shadow-lg pt-4 pb-3 ring-1 ring-black/5 dark:ring-white/5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarContent.displayName = 'SidebarContent';

export const SidebarFooter = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-3 px-2 pt-3 pb-4 border-t border-subtle', className)}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarFooter.displayName = 'SidebarFooter';

// Additional shadcn-style sidebar components
export interface SidebarProviderProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
}) => {
  return <div className='group/sidebar-wrapper'>{children}</div>;
};

export const SidebarInset = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex min-h-svh flex-1 flex-col bg-background', className)}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarInset.displayName = 'SidebarInset';

export const SidebarTrigger = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className = '', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-md p-2 hover:bg-accent',
      className
    )}
    {...props}
  >
    <svg
      width='15'
      height='15'
      viewBox='0 0 15 15'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M1.5 3C1.22386 3 1 3.22386 1 3.5C1 3.77614 1.22386 4 1.5 4H13.5C13.7761 4 14 3.77614 14 3.5C14 3.22386 13.7761 3 13.5 3H1.5ZM1 7.5C1 7.22386 1.22386 7 1.5 7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H1.5C1.22386 8 1 7.77614 1 7.5ZM1 11.5C1 11.2239 1.22386 11 1.5 11H13.5C13.7761 11 14 11.2239 14 11.5C14 11.7761 13.7761 12 13.5 12H1.5C1.22386 12 1 11.7761 1 11.5Z'
        fill='currentColor'
        fillRule='evenodd'
        clipRule='evenodd'
      ></path>
    </svg>
  </button>
));
SidebarTrigger.displayName = 'SidebarTrigger';

export const SidebarRail = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('absolute inset-y-0 left-full w-2', className)}
      {...props}
    />
  )
);
SidebarRail.displayName = 'SidebarRail';

export const SidebarMenu = forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className = '', ...props }, ref) => (
  <ul
    ref={ref}
    className={cn('flex w-full min-w-0 flex-col gap-1', className)}
    {...props}
  />
));
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className = '', ...props }, ref) => (
  <li
    ref={ref}
    className={cn('group/menu-item relative', className)}
    {...props}
  />
));
SidebarMenuItem.displayName = 'SidebarMenuItem';

export interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

export const SidebarMenuButton = forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(
  (
    { className = '', size = 'md', asChild = false, children, ...props },
    ref
  ) => {
    const sizeClasses = {
      sm: 'h-8 px-2 text-sm',
      md: 'h-10 px-3',
      lg: 'h-12 px-4 text-lg',
    };

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        className: cn(
          'flex w-full items-center gap-2 overflow-hidden rounded-md text-left outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50',
          sizeClasses[size],
          className,
          children.props.className
        ),
        ...props,
      });
    }

    return (
      <button
        ref={ref}
        className={cn(
          'flex w-full items-center gap-2 overflow-hidden rounded-md text-left outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';
