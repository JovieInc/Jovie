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

const headerSearchSurfaceChrome =
  'rounded-[12px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[0_0_0_1px_color-mix(in_oklab,var(--linear-app-frame-seam)_18%,transparent)]';

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
          headerSearchSurfaceChrome,
          'inline-flex h-7 min-h-7 min-w-0 items-center justify-start gap-1.5 px-2.5 text-left text-[12px] text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-cinematic ease-cinematic hover:border-default hover:bg-surface-1 hover:text-primary-token focus-ring-themed',
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
      </button>
    );
  }

  return (
    <div
      className={cn(
        headerSearchSurfaceChrome,
        'flex h-7 min-h-7 w-full max-w-[min(560px,calc(100vw-2rem))] items-center justify-start px-2 py-0 text-left shadow-popover sm:w-[440px] lg:w-[520px]',
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
        statusOptions={adapter.statusOptions}
        hasOptions={adapter.hasOptions}
        ariaLabel={adapter.ariaLabel ?? `Filter ${adapter.triggerLabel}`}
        placeholder={adapter.placeholder ?? 'Type to filter'}
        allowedFields={adapter.allowedFields}
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
