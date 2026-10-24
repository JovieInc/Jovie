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
import { isFormElement } from '@/lib/utils/keyboard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeaderActionsState {
  headerActions: ReactNode;
  headerBadge: ReactNode;
  isCommandPaletteOpen: boolean;
  /** Replaces the breadcrumb slot while the command surface is active. */
  commandPaletteHeader: ReactNode;
}

interface HeaderActionsDispatch {
  setHeaderActions: (actions: ReactNode) => void;
  setHeaderBadge: (badge: ReactNode) => void;
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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteHeader, setCommandPaletteHeader] =
    useState<ReactNode>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);

  const openCommandPalette = useCallback(() => {
    if (focusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(focusRestoreFrameRef.current);
      focusRestoreFrameRef.current = null;
    }
    const activeElement = document.activeElement;
    priorFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
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
      isCommandPaletteOpen,
      commandPaletteHeader,
    }),
    [commandPaletteHeader, headerActions, headerBadge, isCommandPaletteOpen]
  );

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(
    () => ({
      setHeaderActions,
      setHeaderBadge,
      openCommandPalette,
      closeCommandPalette,
      setCommandPaletteHeader,
    }),
    [closeCommandPalette, openCommandPalette]
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
 * useRegisterHeaderActions - Register route-owned actions with the shell header.
 *
 * Routes own the action semantics; the shell owns placement, error isolation,
 * and cleanup on navigation. This mirrors the retired
 * `useRegisterHeaderSearch` set-on-mount / clear-on-unmount lifecycle
 * (JOV-8792 removed that hook — the command palette owns search now).
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
