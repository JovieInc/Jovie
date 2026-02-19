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

interface TablePanelState {
  panel: ReactNode;
}

interface TablePanelDispatch {
  setPanel: (node: ReactNode) => void;
}

// ---------------------------------------------------------------------------
// Contexts (split: state vs dispatch)
// ---------------------------------------------------------------------------

const TablePanelStateContext = createContext<TablePanelState | null>(null);
const TablePanelDispatchContext = createContext<TablePanelDispatch | null>(
  null
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TablePanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [panel, setPanel] = useState<ReactNode>(null);

  const state = useMemo(() => ({ panel }), [panel]);

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(() => ({ setPanel }), [setPanel]);

  return (
    <TablePanelDispatchContext.Provider value={dispatch}>
      <TablePanelStateContext.Provider value={state}>
        {children}
      </TablePanelStateContext.Provider>
    </TablePanelDispatchContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Used by pages to register/unregister their sidebar content.
 * Subscribes to dispatch only — no re-render when panel changes.
 */
export function useSetTablePanel() {
  const ctx = useContext(TablePanelDispatchContext);
  if (!ctx) {
    throw new TypeError(
      'useSetTablePanel must be used within TablePanelProvider'
    );
  }
  return ctx.setPanel;
}

/**
 * Used by AuthShell to read the current panel.
 * Subscribes to state only — re-renders when panel changes.
 */
export function useTablePanel(): ReactNode {
  const ctx = useContext(TablePanelStateContext);
  return ctx?.panel ?? null;
}
