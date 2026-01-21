'use client';

import { Kbd } from '@jovie/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import type { NavItem } from './types';

interface NavMenuItemProps {
  item: NavItem;
  isActive: boolean;
  shortcut?: string;
  actions?: ReactNode;
}

function buildTooltip(
  name: string,
  shortcut?: string
): string | { children: ReactNode } {
  if (!shortcut) {
    return name;
  }

  return {
    children: (
      <>
        <span>{name}</span>
        <Kbd variant='tooltip'>{shortcut}</Kbd>
      </>
    ),
  };
}

export function NavMenuItem({
  item,
  isActive,
  shortcut,
  actions,
}: NavMenuItemProps) {
  const tooltip = buildTooltip(item.name, shortcut);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
        <Link
          href={item.href}
          aria-current={isActive ? 'page' : undefined}
          className='flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0'
        >
          <item.icon className='size-4' aria-hidden='true' />
          <span className='truncate group-data-[collapsible=icon]:hidden'>
            {item.name}
          </span>
        </Link>
      </SidebarMenuButton>
      {actions}
    </SidebarMenuItem>
  );
}
