'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  collapsed?: boolean;
}

export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
  ({ open = false, collapsed = false, className = '', id, children, ...props }, ref) => {
    return (
      <div
        id={id}
        ref={ref}
        role='navigation'
        aria-label='Dashboard sidebar'
        className={cn(
          open ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0',
          className,
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
      className={cn('relative flex h-16 shrink-0 items-center px-4 overflow-visible w-full', className)}
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
