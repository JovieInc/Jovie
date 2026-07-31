'use client';

import { Search } from 'lucide-react';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { cn } from '@/lib/utils';

/**
 * Sidebar entry for the one shell-owned search/command surface.
 *
 * Its former popover duplicated command search and competed with the main
 * plane. The trigger stays in the rail for fast discovery; the active input
 * is rendered in the breadcrumb seam by the command surface itself.
 */
export function HeaderSearchSurfaceFromContext({
  className,
}: {
  readonly className?: string;
}) {
  const { openCommandPalette } = useHeaderActions();
  return (
    <button
      type='button'
      data-app-search-trigger='true'
      onClick={openCommandPalette}
      className={cn(
        'inline-flex h-9 min-h-9 w-full min-w-0 items-center justify-start gap-2 rounded-xl border border-subtle bg-surface-0 px-3 text-left text-xs text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-subtle ease-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token focus-ring-themed',
        className
      )}
      aria-label='Search Jovie'
    >
      <Search className='size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate'>Search</span>
      <kbd className='shrink-0 text-2xs text-tertiary-token'>⌘K</kbd>
    </button>
  );
}
