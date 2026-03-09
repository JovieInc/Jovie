'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type AudiencePanelMode = 'contact' | 'analytics';

interface AudiencePanelContextValue {
  /** Currently active panel, or null if closed */
  readonly mode: AudiencePanelMode | null;
  /** Open a specific panel (or toggle it if already active) */
  readonly toggle: (panel: AudiencePanelMode) => void;
  /** Switch to a specific panel without toggling */
  readonly open: (panel: AudiencePanelMode) => void;
  /** Close whichever panel is open */
  readonly close: () => void;
}

const AudiencePanelContext = createContext<AudiencePanelContextValue | null>(
  null
);

export function AudiencePanelProvider({
  children,
  initialMode = null,
}: {
  readonly children: ReactNode;
  readonly initialMode?: AudiencePanelMode | null;
}) {
  const [mode, setMode] = useState<AudiencePanelMode | null>('analytics');

  const toggle = useCallback((panel: AudiencePanelMode) => {
    setMode(prev => (prev === panel ? null : panel));
  }, []);

  const open = useCallback((panel: AudiencePanelMode) => {
    setMode(panel);
  }, []);

  const close = useCallback(() => {
    setMode(null);
  }, []);

  const value = useMemo(
    () => ({ mode, toggle, open, close }),
    [mode, toggle, open, close]
  );

  return (
    <AudiencePanelContext.Provider value={value}>
      {children}
    </AudiencePanelContext.Provider>
  );
}

export function useAudiencePanel(): AudiencePanelContextValue {
  const ctx = useContext(AudiencePanelContext);
  if (!ctx) {
    throw new Error(
      'useAudiencePanel must be used within AudiencePanelProvider'
    );
  }
  return ctx;
}
