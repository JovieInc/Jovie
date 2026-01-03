'use client';

import { ChevronRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';

export interface SidebarCollapsibleGroupProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function SidebarCollapsibleGroup({
  label,
  children,
  defaultOpen = true,
  className,
}: SidebarCollapsibleGroupProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const tooltip = useMemo(() => label, [label]);

  return (
    <SidebarGroup className={cn('space-y-1', className)}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type='button'
            isActive={false}
            onClick={() => setOpen(value => !value)}
            tooltip={tooltip}
            className={cn(
              'justify-between font-semibold uppercase tracking-wide',
              'text-sidebar-muted hover:text-sidebar-foreground'
            )}
            aria-expanded={open}
          >
            <span className='truncate group-data-[collapsible=icon]:hidden text-[11px]'>
              {label}
            </span>
            <ChevronRight
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200 ease-out',
                open ? 'rotate-90' : 'rotate-0'
              )}
              aria-hidden='true'
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className='overflow-hidden'>
          <SidebarGroupContent className='mt-0.5'>
            {children}
          </SidebarGroupContent>
        </div>
      </div>
    </SidebarGroup>
  );
}
