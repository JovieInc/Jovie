'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { OPEN_HEADER_SEARCH_EVENT } from '@/components/shell/header-search-events';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import { isFormElement } from '@/lib/utils/keyboard';

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
  /** Distinct approval status values surfaced as suggestions. */
  readonly approvalOptions?: readonly string[];
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
  /** Main-plane command/search takeover state (JOV-3940). */
  isCommandPaletteOpen: boolean;
  /** Replaces the breadcrumb slot while the command surface is active. */
  commandPaletteHeader: ReactNode;
}

interface HeaderActionsDispatch {
  setHeaderActions: (actions: ReactNode) => void;
  setHeaderBadge: (badge: ReactNode) => void;
  setHeaderSearchAdapter: (adapter: HeaderSearchAdapter | null) => void;
  openSearch: () => void;
  closeSearch: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteHeader: (header: ReactNode) => void;
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
 * Pages can use `useRegisterHeaderActions` to set custom actions that will
 * appear in the app shell's header instead of the default actions.
 *
 * @example
 * ```tsx
 * function MyPageWrapper() {
 *   const actions = useMemo(() => <CustomButton />, []);
 *   useRegisterHeaderActions(actions);
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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteHeader, setCommandPaletteHeader] =
    useState<ReactNode>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);

  const openSearch = useCallback(() => {
    if (focusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
      focusRestoreFrameRef.current = null;
    }
    const activeElement = document.activeElement;
    priorFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    setIsSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => {
    if (focusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
    }
    setIsSearchOpen(false);
    const priorFocus = priorFocusRef.current;
    priorFocusRef.current = null;
    focusRestoreFrameRef.current = requestAnimationFrame(() => {
      focusRestoreFrameRef.current = null;
      if (priorFocus?.isConnected) priorFocus.focus();
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    if (focusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
      focusRestoreFrameRef.current = null;
    }
    const activeElement = document.activeElement;
    priorFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    // The former sidebar popover must never compete with the main-plane surface.
    setIsSearchOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    if (focusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
    }
    setIsCommandPaletteOpen(false);
    setCommandPaletteHeader(null);
    const priorFocus = priorFocusRef.current;
    priorFocusRef.current = null;
    focusRestoreFrameRef.current = requestAnimationFrame(() => {
      focusRestoreFrameRef.current = null;
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.closest('[data-app-shell-sidebar-mount="true"]')
      ) {
        return;
      }
      if (priorFocus?.isConnected) priorFocus.focus();
    });
  }, []);

  useEffect(
    () => () => {
      if (focusRestoreFrameRef.current !== null) {
        cancelAnimationFrame(focusRestoreFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    function onOpenSearch() {
      openCommandPalette();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isFormElement(event.target)
      ) {
        return;
      }
      event.preventDefault();
      openCommandPalette();
    }

    globalThis.addEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  }, [openCommandPalette]);

  const state = useMemo(
    () => ({
      headerActions,
      headerBadge,
      headerSearchAdapter,
      isSearchOpen,
      isCommandPaletteOpen,
      commandPaletteHeader,
    }),
    [
      commandPaletteHeader,
      headerActions,
      headerBadge,
      headerSearchAdapter,
      isCommandPaletteOpen,
      isSearchOpen,
    ]
  );

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(
    () => ({
      setHeaderActions,
      setHeaderBadge,
      setHeaderSearchAdapter,
      openSearch,
      closeSearch,
      openCommandPalette,
      closeCommandPalette,
      setCommandPaletteHeader,
    }),
    [closeCommandPalette, closeSearch, openCommandPalette, openSearch]
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

/**
 * useRegisterHeaderActions - Register route-owned actions with the shell header.
 *
 * Routes own the action semantics; the shell owns placement, error isolation,
 * and cleanup on navigation. This mirrors `useRegisterHeaderSearch` so shell
 * routes do not each reimplement the same set-on-mount / clear-on-unmount
 * lifecycle.
 */
export function useRegisterHeaderActions(actions: ReactNode): void {
  const dispatch = useContext(HeaderActionsDispatchContext);
  const setActions = dispatch?.setHeaderActions;

  useEffect(() => {
    if (!setActions) return undefined;
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
}
