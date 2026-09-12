'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { cn } from '@/lib/utils';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from './SidebarNavItem';

/**
 * Sidebar entry for the one shell-owned search/command surface.
 *
 * Its former popover duplicated command search and competed with the main
 * plane. The trigger stays in the rail for fast discovery; the active input
 * is rendered in the breadcrumb seam by the command surface itself.
 */
export function HeaderSearchSurfaceFromContext({
  className,
  calm = false,
}: {
  readonly className?: string;
  readonly calm?: boolean;
}) {
  const { closeCommandPalette, isCommandPaletteOpen, openCommandPalette } =
    useHeaderActions();

  useEffect(() => {
    if (!isCommandPaletteOpen) return;

    const dismissSearchFromSidebar = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-app-shell-sidebar-mount="true"]')
      ) {
        closeCommandPalette();
      }
    };

    document.addEventListener('click', dismissSearchFromSidebar, true);
    return () => {
      document.removeEventListener('click', dismissSearchFromSidebar, true);
    };
  }, [closeCommandPalette, isCommandPaletteOpen]);

  return (
    <button
      type='button'
      data-app-search-trigger='true'
      onClick={isCommandPaletteOpen ? closeCommandPalette : openCommandPalette}
      className={cn(
        getSidebarNavRowClassName({}),
        'grid-cols-[18px_minmax(0,1fr)_auto] text-left',
        calm && 'h-9 min-w-0 flex-1 rounded-full pl-3.5 pr-0 text-[13px]',
        className
      )}
      aria-label='Search Jovie'
    >
      <Icon
        name='Search'
        className={getSidebarNavIconClassName({})}
        aria-hidden='true'
        strokeWidth={2.25}
      />
      <span className='min-w-0 flex-1 truncate'>
        {calm ? 'Search chats' : 'Search'}
      </span>
      <kbd className='shrink-0 text-2xs text-tertiary-token'>⌘K</kbd>
    </button>
  );
}
