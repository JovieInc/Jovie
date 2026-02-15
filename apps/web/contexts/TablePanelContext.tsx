'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

interface TablePanelContextValue {
  panel: ReactNode;
  setPanel: (node: ReactNode) => void;
}

const TablePanelContext = createContext<TablePanelContextValue | null>(null);

export function TablePanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [panel, setPanel] = useState<ReactNode>(null);

  const value = useMemo(() => ({ panel, setPanel }), [panel]);

  return (
    <TablePanelContext.Provider value={value}>
      {children}
    </TablePanelContext.Provider>
  );
}

/** Used by pages to register/unregister their sidebar content */
export function useSetTablePanel() {
  const ctx = useContext(TablePanelContext);
  if (!ctx) {
    throw new TypeError(
      'useSetTablePanel must be used within TablePanelProvider'
    );
  }
  return ctx.setPanel;
}

/** Used by AuthShell to read the current panel */
export function useTablePanel(): ReactNode {
  const ctx = useContext(TablePanelContext);
  return ctx?.panel ?? null;
}
