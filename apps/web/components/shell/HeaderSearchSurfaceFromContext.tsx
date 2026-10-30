'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { SHORTCUTS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from './SidebarNavItem';
import { Tooltip } from './Tooltip';

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
  compact = false,
}: {
  readonly className?: string;
  readonly calm?: boolean;
  readonly compact?: boolean;
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

  // WCAG 2.5.3 Label in Name: the accessible name must contain the visible
  // text. The calm rail shows 'Search chats' (#22743), so its programmatic
  // name carries that text; compact and default keep the branded name
  // ('Search' is contained in 'Search Jovie').
  const trigger = (
    <button
      type='button'
      data-app-search-trigger='true'
      onClick={isCommandPaletteOpen ? closeCommandPalette : openCommandPalette}
      className={cn(
        compact
          ? 'focus-ring-themed inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-item-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent'
          : cn(
              getSidebarNavRowClassName({}),
              'text-left',
              calm && 'h-9 min-w-0 flex-1 rounded-full text-(length:--text-app)'
            ),
        className
      )}
      aria-label={calm ? 'Search chats in Jovie' : 'Search Jovie'}
    >
      <Icon
        name='Search'
        className={getSidebarNavIconClassName({})}
        aria-hidden='true'
        strokeWidth={2.25}
      />
      {compact ? null : (
        <>
          <span className='min-w-0 flex-1 truncate'>
            {calm ? 'Search chats' : 'Search'}
          </span>
          {/* Decorative shortcut glyph: the text is excluded from the a11y
              tree (aria-hidden lives on the inner span because kbd itself is
              focusable) so the trigger's visible text stays contained in its
              accessible name (WCAG 2.5.3 Label in Name; axe
              label-content-name-mismatch). */}
          <kbd className='shrink-0 text-2xs text-tertiary-token'>
            <span aria-hidden='true'>⌘K</span>
          </kbd>
        </>
      )}
    </button>
  );
  return compact ? (
    <Tooltip label='Search Jovie' shortcut={SHORTCUTS.search} side='bottom'>
      {trigger}
    </Tooltip>
  ) : (
    trigger
  );
}
