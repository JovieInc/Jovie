'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Filter adapter a route exposes so the shell header can render a Linear-style
 * pill search for that route's underlying list. Routes own the data and the
 * filter state; the header owns the search-open transition + key handling.
 */
export interface HeaderSearchAdapter {
  /** Stable id so the header can reset internal state when a new page mounts. */
  readonly key: string;
  readonly pills: readonly FilterPill[];
  readonly onPillsChange: (next: FilterPill[]) => void;
  readonly artistOptions: readonly string[];
  readonly titleOptions: readonly string[];
  readonly albumOptions: readonly string[];
  /** Distinct status values surfaced as suggestions. Defaults to release statuses. */
  readonly statusOptions?: readonly string[];
  /** Distinct "has" values surfaced as suggestions. Defaults to release asset tags. */
  readonly hasOptions?: readonly string[];
  /** Total rows the underlying data set has, before filters apply. */
  readonly totalCount: number;
  /** Rows visible after filters apply. Defaults to `totalCount` when omitted. */
  readonly visibleCount?: number;
  /** Label appearing on the closed trigger ("Search Releases", "Search Tasks"). */
  readonly triggerLabel: string;
  /** Aria-label for the open input. */
  readonly ariaLabel?: string;
  /** Placeholder shown when no pills are active. */
  readonly placeholder?: string;
  /** Restrict the slash-menu / suggestions to a subset of fields. */
  readonly allowedFields?: readonly FilterField[];
}

interface HeaderActionsState {
  headerActions: ReactNode;
  headerBadge: ReactNode;
  headerSearchAdapter: HeaderSearchAdapter | null;
  isSearchOpen: boolean;
}

interface HeaderActionsDispatch {
  setHeaderActions: (actions: ReactNode) => void;
  setHeaderBadge: (badge: ReactNode) => void;
  setHeaderSearchAdapter: (adapter: HeaderSearchAdapter | null) => void;
  openSearch: () => void;
  closeSearch: () => void;
}

/** Full context value – kept for backward-compat of `useHeaderActions()`. */
export interface HeaderActionsContextValue
  extends HeaderActionsState,
    HeaderActionsDispatch {}

// ---------------------------------------------------------------------------
// Contexts (split: state vs dispatch)
// ---------------------------------------------------------------------------

const HeaderActionsStateContext = createContext<HeaderActionsState | undefined>(
  undefined
);

const HeaderActionsDispatchContext = createContext<
  HeaderActionsDispatch | undefined
>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface HeaderActionsProviderProps {
  readonly children: ReactNode;
}

/**
 * HeaderActionsProvider - Allows pages to register custom header actions
 *
 * Pages can use the useSetHeaderActions hook to set custom actions that will
 * appear in the app shell's header instead of the default actions.
 *
 * @example
 * ```tsx
 * function MyPageWrapper() {
 *   const { setHeaderActions } = useSetHeaderActions();
 *
 *   useEffect(() => {
 *     setHeaderActions(
 *       <div className='flex items-center gap-1'>
 *         <CustomButton />
 *         <div className='h-6 w-px bg-border' />
 *         <DrawerToggleButton />
 *       </div>
 *     );
 *   }, [setHeaderActions]);
 *
 *   return <PageContent />;
 * }
 * ```
 */
export function HeaderActionsProvider({
  children,
}: HeaderActionsProviderProps) {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [headerBadge, setHeaderBadge] = useState<ReactNode>(null);
  const [headerSearchAdapter, setHeaderSearchAdapter] =
    useState<HeaderSearchAdapter | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // When the active adapter changes (route swap, page unmount), make sure
  // the search collapses back to the breadcrumb-first state — otherwise
  // navigating from Releases to a non-search route would leave the header
  // stuck in the open pill surface.
  const adapterKey = headerSearchAdapter?.key ?? null;
  useEffect(() => {
    if (!adapterKey) {
      setIsSearchOpen(false);
    }
  }, [adapterKey]);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  const state = useMemo(
    () => ({ headerActions, headerBadge, headerSearchAdapter, isSearchOpen }),
    [headerActions, headerBadge, headerSearchAdapter, isSearchOpen]
  );

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(
    () => ({
      setHeaderActions,
      setHeaderBadge,
      setHeaderSearchAdapter,
      openSearch,
      closeSearch,
    }),
    [closeSearch, openSearch]
  );

  return (
    <HeaderActionsDispatchContext.Provider value={dispatch}>
      <HeaderActionsStateContext.Provider value={state}>
        {children}
      </HeaderActionsStateContext.Provider>
    </HeaderActionsDispatchContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * useSetHeaderActions - Hook to access only the setters (stable, no re-renders)
 *
 * Use this in page components that register header actions but don't read them.
 * Because the dispatch context value is referentially stable, subscribing to it
 * will never cause a re-render.
 */
export function useSetHeaderActions(): HeaderActionsDispatch {
  const dispatch = useContext(HeaderActionsDispatchContext);
  if (!dispatch) {
    throw new TypeError(
      'useSetHeaderActions must be used within HeaderActionsProvider'
    );
  }
  return dispatch;
}

/**
 * useHeaderActions - Hook to access and set header actions
 *
 * Subscribes to BOTH state and dispatch contexts — any change to headerActions
 * or headerBadge will cause a re-render. Prefer `useSetHeaderActions()` when
 * you only need the setters.
 *
 * @throws {Error} If used outside of HeaderActionsProvider
 */
export function useHeaderActions(): HeaderActionsContextValue {
  const state = useContext(HeaderActionsStateContext);
  const dispatch = useContext(HeaderActionsDispatchContext);
  if (!state || !dispatch) {
    throw new TypeError(
      'useHeaderActions must be used within HeaderActionsProvider'
    );
  }
  return useMemo(() => ({ ...state, ...dispatch }), [state, dispatch]);
}

/**
 * useOptionalHeaderActions - Hook to access header actions state (returns null if not in provider)
 *
 * Use this in layout components that need to check for custom actions
 * without requiring the provider to exist. Only subscribes to the state
 * context, so changes to setters won't trigger re-renders.
 */
export function useOptionalHeaderActions(): HeaderActionsState | null {
  return useContext(HeaderActionsStateContext) ?? null;
}

/**
 * useRegisterHeaderSearch - Register a route-level filter adapter with the shell header.
 *
 * The shell renders the PillSearch surface itself; the route just declares
 * which fields are filterable and what the underlying data set looks like.
 * The adapter is cleared automatically on unmount, so the header restores
 * breadcrumb-first chrome on navigation.
 *
 * Pass `null` to opt out (e.g. when a route conditionally exposes search).
 */
export function useRegisterHeaderSearch(
  adapter: HeaderSearchAdapter | null
): void {
  const dispatch = useContext(HeaderActionsDispatchContext);
  const setAdapter = dispatch?.setHeaderSearchAdapter;

  useEffect(() => {
    if (!setAdapter) return undefined;
    setAdapter(adapter);
    return () => setAdapter(null);
  }, [adapter, setAdapter]);
}
