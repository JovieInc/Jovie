'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeaderActionsState {
  headerActions: ReactNode;
  headerBadge: ReactNode;
}

interface HeaderActionsDispatch {
  setHeaderActions: (actions: ReactNode) => void;
  setHeaderBadge: (badge: ReactNode) => void;
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

  const state = useMemo(
    () => ({ headerActions, headerBadge }),
    [headerActions, headerBadge]
  );

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(
    () => ({ setHeaderActions, setHeaderBadge }),
    [setHeaderActions, setHeaderBadge]
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
