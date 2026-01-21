'use client';

import { Kbd } from '@jovie/ui';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import type { KeyboardShortcut } from '@/lib/keyboard-shortcuts';
import type { NavItem } from './types';

interface NavMenuItemProps {
  item: NavItem;
  isActive: boolean;
  shortcut?: KeyboardShortcut;
  actions?: ReactNode;
}

/**
 * Render shortcut keys in tooltip format
 * Handles both "G then D" sequential and single key formats
 */
function ShortcutKeys({ shortcut }: { shortcut: KeyboardShortcut }) {
  const { keys } = shortcut;

  // Handle "G then D" style sequential shortcuts
  if (keys.includes(' then ')) {
    const [first, second] = keys.split(' then ');
    return (
      <span className='inline-flex items-center gap-1 ml-2'>
        <Kbd variant='tooltip'>{first}</Kbd>
        <span className='text-[10px] opacity-70'>then</span>
        <Kbd variant='tooltip'>{second}</Kbd>
      </span>
    );
  }

  // Handle space-separated keys (like "⌘ K")
  return (
    <Kbd variant='tooltip' className='ml-2'>
      {keys}
    </Kbd>
  );
}

function buildTooltip(
  name: string,
  shortcut?: KeyboardShortcut
): string | { children: ReactNode } {
  if (!shortcut) {
    return name;
  }

  return {
    children: (
      <>
        <span>{name}</span>
        <ShortcutKeys shortcut={shortcut} />
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
  // Memoize tooltip to prevent creating new objects on every render,
  // which would cause unnecessary re-renders in SidebarMenuButton
  const tooltip = useMemo(
    () => buildTooltip(item.name, shortcut),
    [item.name, shortcut]
  );

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
