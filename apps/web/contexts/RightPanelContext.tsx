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

interface RightPanelState {
  panel: ReactNode;
}

interface RightPanelDispatch {
  setPanel: (node: ReactNode) => void;
}

// ---------------------------------------------------------------------------
// Contexts (split: state vs dispatch)
// ---------------------------------------------------------------------------

const RightPanelStateContext = createContext<RightPanelState | null>(null);
const RightPanelDispatchContext = createContext<RightPanelDispatch | null>(
  null
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RightPanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [panel, setPanel] = useState<ReactNode>(null);

  const state = useMemo(() => ({ panel }), [panel]);

  // useState setters are referentially stable, so this memo never recomputes.
  const dispatch = useMemo(() => ({ setPanel }), [setPanel]);

  return (
    <RightPanelDispatchContext.Provider value={dispatch}>
      <RightPanelStateContext.Provider value={state}>
        {children}
      </RightPanelStateContext.Provider>
    </RightPanelDispatchContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Used by pages to register/unregister their sidebar content.
 * Subscribes to dispatch only — no re-render when panel changes.
 */
export function useSetRightPanel() {
  const ctx = useContext(RightPanelDispatchContext);
  if (!ctx) {
    throw new TypeError(
      'useSetRightPanel must be used within RightPanelProvider'
    );
  }
  return ctx.setPanel;
}

/**
 * Used by AuthShell to read the current panel.
 * Subscribes to state only — re-renders when panel changes.
 */
export function useRightPanel(): ReactNode {
  const ctx = useContext(RightPanelStateContext);
  return ctx?.panel ?? null;
}
