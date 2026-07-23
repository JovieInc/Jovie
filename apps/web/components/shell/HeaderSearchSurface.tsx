'use client';

import { Button } from '@jovie/ui';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type HeaderSearchAdapter } from '@/contexts/HeaderActionsContext';
import { cn } from '@/lib/utils';
import {
  buildHeaderSearchGroups,
  type HeaderSearchCatalog,
  type HeaderSearchResultGroup,
  type SearchableRelease,
} from './header-search-results';
import { PillSearch } from './PillSearch';
import {
  FIELD_LABEL,
  type FilterField,
  HAS_VALUES,
  STATUS_VALUES,
} from './pill-search.types';

interface HeaderSearchSurfaceProps {
  readonly adapter?: HeaderSearchAdapter | null;
  readonly catalog?: HeaderSearchCatalog;
  readonly isLoading?: boolean;
  readonly searchLibraryAssets?: (
    query: string,
    signal: AbortSignal
  ) => Promise<readonly SearchableRelease[]>;
  /** Invalidates remote release results when the active artist changes. */
  readonly remoteSearchScopeKey?: string | null;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly className?: string;
}

const EMPTY_CATALOG: HeaderSearchCatalog = {
  conversations: [],
  profiles: [],
  releases: [],
};

const HEADER_SEARCH_DEBOUNCE_MS = 250;
const MIN_REMOTE_QUERY_LENGTH = 2;

const headerSearchSurfaceChrome =
  'rounded-xl border border-subtle bg-surface-0 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-border-subtle)_18%,transparent)]';

function flattenGroups(groups: readonly HeaderSearchResultGroup[]) {
  return groups.flatMap(group => group.items);
}

interface ContextualSuggestion {
  readonly field: FilterField;
  readonly value: string;
}

function contextualFilterSuggestions(
  query: string,
  adapter: HeaderSearchAdapter | null
): ContextualSuggestion[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!adapter || !normalizedQuery) return [];
  const allowedFields = new Set<FilterField>(
    adapter.allowedFields ?? (Object.keys(FIELD_LABEL) as FilterField[])
  );
  const values: Record<FilterField, readonly string[]> = {
    artist: adapter.artistOptions,
    title: adapter.titleOptions,
    album: adapter.albumOptions,
    status: adapter.statusOptions ?? STATUS_VALUES,
    approval: adapter.approvalOptions ?? [],
    has: adapter.hasOptions ?? HAS_VALUES,
  };

  return (Object.keys(values) as FilterField[])
    .filter(field => allowedFields.has(field))
    .flatMap(field =>
      values[field]
        .filter(value => value.toLocaleLowerCase().includes(normalizedQuery))
        .map(value => ({ field, value }))
    )
    .slice(0, 5);
}

function HeaderGlobalSearch({
  catalog,
  adapter,
  isLoading,
  searchLibraryAssets,
  remoteSearchScopeKey,
  onClose,
  onOpenFilters,
}: {
  readonly catalog: HeaderSearchCatalog;
  readonly adapter: HeaderSearchAdapter | null;
  readonly isLoading: boolean;
  readonly searchLibraryAssets?: (
    query: string,
    signal: AbortSignal
  ) => Promise<readonly SearchableRelease[]>;
  readonly remoteSearchScopeKey?: string | null;
  readonly onClose: () => void;
  readonly onOpenFilters?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteSearch, setRemoteSearch] = useState<{
    readonly scopeKey: string;
    readonly query: string;
    readonly releases: readonly SearchableRelease[];
    readonly status: 'idle' | 'loading' | 'success' | 'error';
  }>({
    scopeKey: remoteSearchScopeKey ?? '',
    query: '',
    releases: [],
    status: 'idle',
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const normalizedQuery = query.trim();
  const remoteScopeKey = remoteSearchScopeKey ?? '';
  const canSearchRemotely =
    Boolean(searchLibraryAssets) &&
    normalizedQuery.length >= MIN_REMOTE_QUERY_LENGTH;
  const remoteSearchPending =
    canSearchRemotely &&
    (remoteSearch.scopeKey !== remoteScopeKey ||
      remoteSearch.query !== normalizedQuery ||
      remoteSearch.status === 'loading');
  const remoteSearchFailed =
    canSearchRemotely &&
    remoteSearch.scopeKey === remoteScopeKey &&
    remoteSearch.query === normalizedQuery &&
    remoteSearch.status === 'error';
  const effectiveCatalog = useMemo<HeaderSearchCatalog>(
    () => ({
      ...catalog,
      releases: searchLibraryAssets
        ? remoteSearch.scopeKey === remoteScopeKey &&
          remoteSearch.query === normalizedQuery
          ? remoteSearch.releases
          : []
        : catalog.releases,
    }),
    [
      catalog,
      normalizedQuery,
      remoteScopeKey,
      remoteSearch,
      searchLibraryAssets,
    ]
  );
  const groups = useMemo(
    () => buildHeaderSearchGroups(query, effectiveCatalog),
    [effectiveCatalog, query]
  );
  const items = useMemo(() => flattenGroups(groups), [groups]);
  const contextualSuggestions = useMemo(
    () => contextualFilterSuggestions(query, adapter),
    [adapter, query]
  );
  const resultCount = items.length + contextualSuggestions.length;
  const hasQuery = query.trim().length > 0;
  const activeIndex = resultCount
    ? Math.max(0, Math.min(selectedIndex, resultCount - 1))
    : null;

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!searchLibraryAssets || !canSearchRemotely) {
      setRemoteSearch({
        scopeKey: remoteScopeKey,
        query: normalizedQuery,
        releases: [],
        status: 'idle',
      });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setRemoteSearch({
      scopeKey: remoteScopeKey,
      query: normalizedQuery,
      releases: [],
      status: 'loading',
    });

    const timeout = globalThis.setTimeout(async () => {
      try {
        const releases = await searchLibraryAssets(
          normalizedQuery,
          controller.signal
        );
        if (!active) return;
        setRemoteSearch({
          scopeKey: remoteScopeKey,
          query: normalizedQuery,
          releases,
          status: 'success',
        });
      } catch {
        if (!active || controller.signal.aborted) return;
        setRemoteSearch({
          scopeKey: remoteScopeKey,
          query: normalizedQuery,
          releases: [],
          status: 'error',
        });
      }
    }, HEADER_SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      globalThis.clearTimeout(timeout);
      controller.abort();
    };
  }, [canSearchRemotely, normalizedQuery, remoteScopeKey, searchLibraryAssets]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(index =>
        resultCount === 0 ? 0 : Math.min(index + 1, resultCount - 1)
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(index => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && activeIndex !== null) {
      event.preventDefault();
      document.getElementById(`${listboxId}-option-${activeIndex}`)?.click();
    }
  }

  function commitContextualSuggestion(suggestion: ContextualSuggestion) {
    if (!adapter) return;
    const matchingPill = adapter.pills.find(
      pill => pill.field === suggestion.field && pill.op === 'is'
    );
    if (matchingPill) {
      adapter.onPillsChange(
        adapter.pills.map(pill =>
          pill.id === matchingPill.id && !pill.values.includes(suggestion.value)
            ? { ...pill, values: [...pill.values, suggestion.value] }
            : pill
        )
      );
    } else {
      adapter.onPillsChange([
        ...adapter.pills,
        {
          id: `header-${adapter.key}-${suggestion.field}-${suggestion.value}`,
          field: suggestion.field,
          op: 'is',
          values: [suggestion.value],
        },
      ]);
    }
    setQuery('');
    inputRef.current?.focus();
  }

  const indexedGroups = groups.map((group, groupIndex) => ({
    group,
    startIndex: groups
      .slice(0, groupIndex)
      .reduce(
        (count, precedingGroup) => count + precedingGroup.items.length,
        0
      ),
  }));

  return (
    <div className='relative h-full w-full min-w-0'>
      <div className='flex h-full min-h-0 items-center gap-1.5 overflow-hidden'>
        <Search
          className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
          strokeWidth={2.25}
          aria-hidden='true'
        />
        <input
          ref={inputRef}
          type='search'
          role='combobox'
          aria-label='Search Jovie'
          aria-autocomplete='list'
          aria-expanded={hasQuery}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex === null
              ? undefined
              : `${listboxId}-option-${activeIndex}`
          }
          data-app-search-field='true'
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Search threads, entities, and library'
          className='min-w-0 flex-1 bg-transparent text-xs text-primary-token outline-none placeholder:text-tertiary-token [&::-webkit-search-cancel-button]:hidden'
        />
        {onOpenFilters ? (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={onOpenFilters}
            aria-label='Filter Current View'
            className='h-6 w-6 shrink-0'
          >
            <SlidersHorizontal className='h-3.5 w-3.5' aria-hidden='true' />
          </Button>
        ) : null}
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onClose}
          aria-label='Close Search'
          className='h-6 w-6 shrink-0'
        >
          <X className='h-3.5 w-3.5' aria-hidden='true' />
        </Button>
      </div>

      {hasQuery ? (
        <div
          id={listboxId}
          role='listbox'
          aria-label='Search Results'
          className='absolute inset-x-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-subtle bg-surface-0 p-1.5 shadow-popover'
        >
          {indexedGroups.map(({ group, startIndex }) => (
            <fieldset
              key={group.kind}
              aria-label={group.label}
              data-search-result-group={group.kind}
              className='m-0 min-w-0 border-0 p-0'
            >
              <div
                aria-hidden='true'
                className='px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-tertiary-token'
              >
                {group.label}
              </div>
              {group.items.map((item, itemIndex) => {
                const index = startIndex + itemIndex;
                return (
                  <Link
                    key={item.id}
                    id={`${listboxId}-option-${index}`}
                    href={item.href}
                    role='option'
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={onClose}
                    className={cn(
                      'flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-subtle ease-subtle',
                      activeIndex === index
                        ? 'bg-surface-1 text-primary-token'
                        : 'text-secondary-token hover:bg-surface-0 hover:text-primary-token'
                    )}
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-xs font-medium'>
                        {item.label}
                      </span>
                      <span className='block truncate text-2xs text-tertiary-token'>
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </fieldset>
          ))}
          {contextualSuggestions.length > 0 ? (
            <fieldset
              aria-label='Current View'
              data-search-result-group='current-view'
              className='m-0 min-w-0 border-0 p-0'
            >
              <div
                aria-hidden='true'
                className='px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-tertiary-token'
              >
                Current view
              </div>
              {contextualSuggestions.map((suggestion, suggestionIndex) => {
                const index = items.length + suggestionIndex;
                return (
                  <Button
                    key={`${suggestion.field}:${suggestion.value}`}
                    id={`${listboxId}-option-${index}`}
                    type='button'
                    variant='ghost'
                    role='option'
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => commitContextualSuggestion(suggestion)}
                    className={cn(
                      'flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-subtle ease-subtle',
                      activeIndex === index
                        ? 'bg-surface-1 text-primary-token'
                        : 'text-secondary-token hover:bg-surface-0 hover:text-primary-token'
                    )}
                  >
                    <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                      {suggestion.value}
                    </span>
                    <span className='shrink-0 text-2xs text-tertiary-token'>
                      Filter by {FIELD_LABEL[suggestion.field].toLowerCase()}
                    </span>
                  </Button>
                );
              })}
            </fieldset>
          ) : null}
          {groups.length === 0 && contextualSuggestions.length === 0 ? (
            <div
              role='status'
              aria-live='polite'
              className='min-h-10 px-2 py-3 text-xs text-tertiary-token'
            >
              {isLoading || remoteSearchPending
                ? 'Searching…'
                : remoteSearchFailed
                  ? 'Search unavailable'
                  : 'No matching results'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shell-owned global search surface. It owns one persistent header position
 * on every route; route adapters remain available as a contextual filter mode.
 */
export function HeaderSearchSurface({
  adapter = null,
  catalog = EMPTY_CATALOG,
  isLoading = false,
  searchLibraryAssets,
  remoteSearchScopeKey,
  isOpen,
  onOpen,
  onClose,
  className,
}: HeaderSearchSurfaceProps) {
  const [showFilters, setShowFilters] = useState(false);
  const adapterKey = adapter?.key;

  useEffect(() => {
    setShowFilters(false);
  }, [adapterKey, isOpen]);

  if (!isOpen) {
    return (
      <button
        type='button'
        data-app-search-trigger='true'
        onClick={onOpen}
        className={cn(
          headerSearchSurfaceChrome,
          'inline-flex h-7 min-h-7 min-w-0 items-center justify-start gap-1.5 px-2.5 text-left text-xs text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-cinematic ease-cinematic hover:border-default hover:bg-surface-1 hover:text-primary-token focus-ring-themed',
          className
        )}
        aria-label='Search'
      >
        <Search className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='hidden sm:inline'>Search</span>
        <kbd className='hidden text-2xs text-tertiary-token sm:inline'>/</kbd>
      </button>
    );
  }

  return (
    <div
      className={cn(
        headerSearchSurfaceChrome,
        'relative flex h-7 min-h-7 w-full max-w-[min(560px,calc(100vw-2rem))] items-center justify-start px-2 py-0 text-left shadow-popover transition-[border-color,box-shadow,background-color] duration-subtle focus-within:border-focus focus-within:bg-surface-0 focus-within:ring-2 focus-within:ring-ring/14 sm:w-110 lg:w-130',
        className
      )}
    >
      {showFilters && adapter ? (
        <PillSearch
          active
          pills={adapter.pills}
          onPillsChange={adapter.onPillsChange}
          artistOptions={adapter.artistOptions}
          titleOptions={adapter.titleOptions}
          albumOptions={adapter.albumOptions}
          statusOptions={adapter.statusOptions}
          approvalOptions={adapter.approvalOptions}
          hasOptions={adapter.hasOptions}
          ariaLabel={adapter.ariaLabel ?? `Filter ${adapter.triggerLabel}`}
          placeholder={adapter.placeholder ?? 'Type to filter'}
          allowedFields={adapter.allowedFields}
          onClose={onClose}
        />
      ) : (
        <HeaderGlobalSearch
          catalog={catalog}
          adapter={adapter}
          isLoading={isLoading}
          searchLibraryAssets={searchLibraryAssets}
          remoteSearchScopeKey={remoteSearchScopeKey}
          onClose={onClose}
          onOpenFilters={adapter ? () => setShowFilters(true) : undefined}
        />
      )}
    </div>
  );
}
