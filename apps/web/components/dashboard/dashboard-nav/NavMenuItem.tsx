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
  readonly item: NavItem;
  readonly isActive: boolean;
  readonly shortcut?: KeyboardShortcut;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  /** When provided, renders a button instead of a link */
  readonly onClick?: () => void;
}

/**
 * Render shortcut keys in tooltip format
 * Handles both "G then D" sequential and single key formats
 */
function ShortcutKeys({ shortcut }: { readonly shortcut: KeyboardShortcut }) {
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
  children,
  onClick,
}: NavMenuItemProps) {
  // Memoize tooltip to prevent creating new objects on every render,
  // which would cause unnecessary re-renders in SidebarMenuButton
  const tooltip = useMemo(
    () => buildTooltip(item.name, shortcut),
    [item.name, shortcut]
  );

  const innerContent = (
    <>
      {/* Fixed-width icon container for consistent alignment */}
      <span
        data-sidebar-icon
        className='flex size-4 shrink-0 items-center justify-center'
      >
        <item.icon className='size-4' aria-hidden='true' />
      </span>
      <span className='truncate group-data-[collapsible=icon]:hidden'>
        {item.name}
      </span>
    </>
  );

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
        {onClick ? (
          <button
            type='button'
            onClick={onClick}
            aria-pressed={isActive}
            className='flex w-full min-w-0 items-center group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center'
          >
            {innerContent}
          </button>
        ) : (
          <Link
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className='flex w-full min-w-0 items-center group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center'
          >
            {innerContent}
          </Link>
        )}
      </SidebarMenuButton>
      {actions}
      {children}
    </SidebarMenuItem>
  );
}
