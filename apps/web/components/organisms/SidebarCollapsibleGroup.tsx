'use client';

import type { LucideIcon } from 'lucide-react';
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
  readonly label: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly icon?: LucideIcon;
}

export function SidebarCollapsibleGroup({
  label,
  children,
  defaultOpen = true,
  className,
  icon: GroupIcon,
}: SidebarCollapsibleGroupProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const tooltip = useMemo(() => label, [label]);

  return (
    <SidebarGroup className={cn('space-y-0', className)}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type='button'
            isActive={false}
            onClick={() => setOpen(value => !value)}
            tooltip={tooltip}
            className={cn(
              'justify-between',
              'text-sidebar-item-icon hover:bg-transparent',
              'h-6 px-1.5'
            )}
            aria-expanded={open}
          >
            <span className='truncate group-data-[collapsible=icon]:hidden text-2xs tracking-wide'>
              {label}
            </span>
            {GroupIcon ? (
              <GroupIcon
                className='h-4 w-4 shrink-0 opacity-50 group-data-[collapsible=icon]:inline hidden'
                aria-hidden='true'
              />
            ) : null}
            <ChevronRight
              className={cn(
                'size-3 shrink-0 opacity-50 transition-transform duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
                open ? 'rotate-90' : 'rotate-0'
              )}
              aria-hidden='true'
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className='overflow-hidden'>
          <SidebarGroupContent className='mt-0'>{children}</SidebarGroupContent>
        </div>
      </div>
    </SidebarGroup>
  );
}
