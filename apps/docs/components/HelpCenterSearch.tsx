'use client';

import { useRouter } from 'next/navigation';
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  articleIdFromPathname,
  hashQuery,
  queryLengthBucket,
  trackHelpCenterEvent,
} from '@/lib/help-analytics.mjs';
import {
  categoryLabel,
  excerptSegments,
  highlightedText,
  isEditableTarget,
  isSearchShortcut,
  relevantCategories,
  resultUrl,
  supportUrl,
} from '@/lib/help-search.mjs';

type PagefindResult = {
  url: string;
  meta: Record<string, string>;
  excerpt: string;
};

type PagefindResponse = {
  results: Array<{ data: () => Promise<PagefindResult> }>;
};

type PagefindApi = {
  debouncedSearch: (query: string) => Promise<PagefindResponse | null>;
  options: (options: { baseUrl: string }) => Promise<void>;
};

declare global {
  interface Window {
    pagefind?: PagefindApi;
  }
}

const RESULT_LIMIT = 8;
const PAGEFIND_PATH = '/_pagefind/pagefind.js';

function SearchIcon() {
  return <span className='help-search-icon' aria-hidden='true' />;
}

type HelpCenterSearchProps = {
  readonly variant?: 'desktop-only' | 'mobile-only';
};

export function HelpCenterSearch({
  variant = 'desktop-only',
}: HelpCenterSearchProps) {
  const router = useRouter();
  const entryRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef(0);
  const listboxId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [state, setState] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'offline'
  >('idle');
  const [activeIndex, setActiveIndex] = useState(0);

  const open = useCallback((source?: HTMLElement | null) => {
    if (document.querySelector('dialog.help-search-dialog[open]')) return;
    if (!source) {
      const bounds = entryRef.current?.getBoundingClientRect();
      if (
        !bounds ||
        bounds.right <= 0 ||
        bounds.bottom <= 0 ||
        bounds.left >= window.innerWidth ||
        bounds.top >= window.innerHeight
      ) {
        return;
      }
    }
    returnFocusRef.current = source ?? (document.activeElement as HTMLElement);
    void trackHelpCenterEvent('search_opened', {
      source_surface: 'search_dialog',
    });
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true })
    );
  }, []);

  const close = useCallback(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
    requestAnimationFrame(() =>
      returnFocusRef.current?.focus({ preventScroll: true })
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = isSearchShortcut(event, navigator.platform);
      if (!shortcut) return;
      if (shortcut === 'slash' && isEditableTarget(event.target)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const normalized = query.trim();
    const request = ++requestRef.current;
    if (!normalized) {
      setResults([]);
      setState('idle');
      return;
    }
    if (!navigator.onLine) {
      setResults([]);
      setState('offline');
      return;
    }
    setState('loading');
    const search = async () => {
      try {
        if (!window.pagefind) {
          const pagefind = (await import(
            /* webpackIgnore: true */ PAGEFIND_PATH
          )) as PagefindApi;
          window.pagefind = pagefind;
          await pagefind.options({ baseUrl: '/' });
        }
        const response = await window.pagefind?.debouncedSearch(normalized);
        if (!response || request !== requestRef.current) return;
        const data = await Promise.all(
          response.results.slice(0, RESULT_LIMIT).map(result => result.data())
        );
        if (request !== requestRef.current) return;
        setResults(data);
        setActiveIndex(0);
        setState(data.length ? 'ready' : 'empty');
        void hashQuery(normalized).then(queryHash => {
          void trackHelpCenterEvent('search_query_submitted', {
            query_hash: queryHash,
            query_length_bucket: queryLengthBucket(normalized),
            source_surface: 'search_dialog',
          });
          if (!data.length) {
            void trackHelpCenterEvent('search_zero_results', {
              query_hash: queryHash,
              query_length_bucket: queryLengthBucket(normalized),
              source_surface: 'search_zero_results',
            });
          }
        });
      } catch {
        if (request === requestRef.current) {
          setResults([]);
          setState(navigator.onLine ? 'error' : 'offline');
        }
      }
    };
    void search();
  }, [query]);

  const selectResult = (result: PagefindResult, rank: number) => {
    const trimmedQuery = query.trim();
    void hashQuery(trimmedQuery).then(queryHash => {
      void trackHelpCenterEvent('search_result_selected', {
        result_id: articleIdFromPathname(result.url) ?? undefined,
        result_rank: rank,
        query_hash: queryHash,
        query_length_bucket: queryLengthBucket(trimmedQuery),
        source_surface: 'search_dialog',
      });
    });
    const destination = resultUrl(result.url, query.trim());
    dialogRef.current?.close();
    setQuery('');
    router.push(destination);
  };

  const openSupport = (sourceSurface: string) => {
    const trimmedQuery = query.trim();
    void hashQuery(trimmedQuery).then(queryHash => {
      const context = {
        query_hash: queryHash || undefined,
        query_length_bucket: queryLengthBucket(trimmedQuery),
        source_surface: sourceSurface,
      };
      void trackHelpCenterEvent('contact_support_opened', context);
      void trackHelpCenterEvent('support_escalation', context);
    });
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex], activeIndex);
    }
  };

  return (
    <div
      ref={entryRef}
      className={`help-search-entry help-search-entry--${variant}`}
    >
      <button
        className='help-search-desktop'
        type='button'
        onClick={event => open(event.currentTarget)}
      >
        <SearchIcon />
        <span>Search the Help Center</span>
        <kbd>⌘K</kbd>
      </button>
      <button
        className='help-search-mobile'
        type='button'
        aria-label='Search the Help Center'
        onClick={event => open(event.currentTarget)}
      >
        <SearchIcon />
      </button>
      <dialog
        ref={dialogRef}
        className='help-search-dialog'
        aria-labelledby='help-search-title'
        onCancel={event => {
          event.preventDefault();
          close();
        }}
        onClick={event => {
          if (event.target === dialogRef.current) close();
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') close();
        }}
      >
        <div className='help-search-panel'>
          <h2 id='help-search-title' className='help-search-sr-only'>
            Search the Help Center
          </h2>
          <div className='help-search-input-row'>
            <SearchIcon />
            <input
              ref={inputRef}
              type='search'
              role='combobox'
              aria-autocomplete='list'
              aria-expanded='true'
              value={query}
              placeholder='What can we help with?'
              aria-label='Search Help Center articles'
              aria-controls={listboxId}
              aria-describedby={statusId}
              aria-activedescendant={
                results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
              }
              onChange={event => setQuery(event.currentTarget.value)}
              onKeyDown={onInputKeyDown}
            />
            <button type='button' className='help-search-close' onClick={close}>
              Esc
            </button>
          </div>
          <div
            id={statusId}
            className='help-search-status'
            role='status'
            aria-live='polite'
          >
            {state === 'loading' && 'Searching…'}
            {state === 'ready' && `${results.length} results`}
            {state === 'error' &&
              'Search could not load. Check your connection and try again.'}
            {state === 'offline' &&
              'You appear to be offline. Your query is saved; reconnect and try again.'}
          </div>
          <div className='help-search-results-frame'>
            {state === 'idle' && (
              <p className='help-search-hint'>
                Search profiles, music, links, analytics, billing, and account
                help.
              </p>
            )}
            {state === 'loading' && (
              <div className='help-search-skeleton' aria-hidden='true'>
                <span />
                <span />
                <span />
              </div>
            )}
            {state === 'ready' && (
              <div
                id={listboxId}
                role='listbox'
                aria-label='Help Center search results'
              >
                {results.map((result, index) => {
                  const segments: Array<{
                    value: string;
                    highlighted: boolean;
                    offset: number;
                  }> = result.meta.description
                    ? highlightedText(result.meta.description, query)
                    : excerptSegments(result.excerpt);
                  const category = categoryLabel(result.meta.category);
                  const contentType =
                    result.meta.contentType === 'reference'
                      ? ' · Reference'
                      : '';
                  return (
                    <button
                      id={`${listboxId}-${index}`}
                      key={result.url}
                      role='option'
                      aria-selected={index === activeIndex}
                      type='button'
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => selectResult(result, index)}
                    >
                      <span className='help-search-breadcrumb'>
                        {category}
                        {contentType}
                      </span>
                      <strong>{result.meta.title}</strong>
                      <span className='help-search-excerpt'>
                        {segments.map(segment => (
                          <Fragment key={segment.offset}>
                            {segment.highlighted ? (
                              <mark>{segment.value}</mark>
                            ) : (
                              segment.value
                            )}
                          </Fragment>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {state === 'empty' && (
              <div className='help-search-empty'>
                <strong>No exact answer for “{query.trim()}”</strong>
                <p>Try one of these areas, or send this search to support.</p>
                <div className='help-search-categories'>
                  {relevantCategories(query).map(category => (
                    <button
                      key={category.id}
                      type='button'
                      onClick={() => setQuery(category.label)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <a
                  href={supportUrl(query.trim())}
                  onClick={() => openSupport('search_zero_results')}
                >
                  Contact support with this search
                </a>
              </div>
            )}
            {(state === 'error' || state === 'offline') && (
              <div className='help-search-recovery'>
                <button
                  type='button'
                  onClick={() => setQuery(value => `${value} `)}
                >
                  Try again
                </button>
                <a
                  href={supportUrl(query.trim(), 'help-search-error')}
                  onClick={() => openSupport('search_error')}
                >
                  Contact support
                </a>
              </div>
            )}
          </div>
          <p className='help-search-footer' aria-hidden='true'>
            ↑↓ move · Enter open · Esc close
          </p>
        </div>
      </dialog>
    </div>
  );
}
