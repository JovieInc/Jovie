'use client';

import { Search } from 'lucide-react';
import { useCallback } from 'react';
import {
  type HeaderSearchAdapter,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { cn } from '@/lib/utils';
import { PillSearch } from './PillSearch';

interface HeaderSearchSurfaceProps {
  readonly adapter: HeaderSearchAdapter;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly className?: string;
}

/**
 * Shell-owned search surface that morphs between a compact trigger button
 * (closed) and a full PillSearch panel (open).
 *
 * Mounted by `AuthShell` in the breadcrumb slot when a route has registered
 * an adapter via `useRegisterHeaderSearch`. The component never owns whether
 * the search is open — that lives in `HeaderActionsContext` so global
 * shortcuts (/, Cmd/Ctrl+K, Escape) can drive it from anywhere in the shell.
 */
export function HeaderSearchSurface({
  adapter,
  isOpen,
  onOpen,
  onClose,
  className,
}: HeaderSearchSurfaceProps) {
  const visibleCount = adapter.visibleCount ?? adapter.totalCount;
  const showFilteredOf = visibleCount !== adapter.totalCount;

  const handleCloseAndClear = useCallback(() => {
    if (adapter.pills.length > 0) {
      adapter.onPillsChange([]);
    }
    onClose();
  }, [adapter, onClose]);

  if (!isOpen) {
    return (
      <button
        type='button'
        data-app-search-trigger='true'
        onClick={onOpen}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2 text-[12px] text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
          className
        )}
        aria-label={adapter.ariaLabel ?? adapter.triggerLabel}
      >
        <Search className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='hidden sm:inline'>{adapter.triggerLabel}</span>
        <span className='tabular-nums text-tertiary-token'>
          {visibleCount}
          {showFilteredOf ? ` of ${adapter.totalCount}` : ''}
        </span>
        <span className='hidden text-tertiary-token lg:inline'>/</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'w-full max-w-[min(560px,calc(100vw-2rem))] rounded-lg border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-2 py-1 shadow-[0_10px_32px_rgba(0,0,0,0.16)] sm:w-[440px] lg:w-[520px]',
        className
      )}
    >
      <PillSearch
        active={isOpen}
        pills={adapter.pills}
        onPillsChange={adapter.onPillsChange}
        artistOptions={adapter.artistOptions}
        titleOptions={adapter.titleOptions}
        albumOptions={adapter.albumOptions}
        ariaLabel={adapter.ariaLabel ?? `Filter ${adapter.triggerLabel}`}
        placeholder={adapter.placeholder ?? 'Type to filter — / for fields'}
        onClose={handleCloseAndClear}
      />
    </div>
  );
}

/**
 * Convenience wrapper that pulls the adapter + open state from context.
 * Returns `null` when no route has registered an adapter, so the shell can
 * fall through to its normal breadcrumb chrome.
 */
export function HeaderSearchSurfaceFromContext({
  className,
}: {
  readonly className?: string;
}) {
  const { headerSearchAdapter, isSearchOpen, openSearch, closeSearch } =
    useHeaderActions();

  if (!headerSearchAdapter) return null;

  return (
    <HeaderSearchSurface
      adapter={headerSearchAdapter}
      isOpen={isSearchOpen}
      onOpen={openSearch}
      onClose={closeSearch}
      className={className}
    />
  );
}
