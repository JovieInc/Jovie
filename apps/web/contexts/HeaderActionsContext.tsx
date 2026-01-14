'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface HeaderActionsContextValue {
  headerActions: ReactNode;
  setHeaderActions: (actions: ReactNode) => void;
}

const HeaderActionsContext = createContext<
  HeaderActionsContextValue | undefined
>(undefined);

export interface HeaderActionsProviderProps {
  children: ReactNode;
}

/**
 * HeaderActionsProvider - Allows pages to register custom header actions
 *
 * Pages can use the useHeaderActions hook to set custom actions that will
 * appear in the app shell's header instead of the default actions.
 *
 * @example
 * ```tsx
 * function MyPageWrapper() {
 *   const { setHeaderActions } = useHeaderActions();
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

  const value = useMemo(
    () => ({ headerActions, setHeaderActions }),
    [headerActions]
  );

  return (
    <HeaderActionsContext.Provider value={value}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

/**
 * useHeaderActions - Hook to access and set header actions
 *
 * @throws {Error} If used outside of HeaderActionsProvider
 */
export function useHeaderActions(): HeaderActionsContextValue {
  const context = useContext(HeaderActionsContext);
  if (!context) {
    throw new Error(
      'useHeaderActions must be used within HeaderActionsProvider'
    );
  }
  return context;
}

/**
 * useOptionalHeaderActions - Hook to access header actions (returns null if not in provider)
 *
 * Use this in layout components that need to check for custom actions
 * without requiring the provider to exist.
 */
export function useOptionalHeaderActions(): HeaderActionsContextValue | null {
  return useContext(HeaderActionsContext) ?? null;
}
