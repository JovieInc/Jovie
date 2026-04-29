'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

export type TableMeta = {
  rowCount: number | null;
  toggle?: (() => void) | null;
  rightPanelWidth?: number | null;
};

type TableMetaContextValue = {
  tableMeta: TableMeta;
  setTableMeta: (meta: TableMeta) => void;
};

export const TableMetaContext = createContext<TableMetaContextValue | null>(
  null
);

export function useTableMeta(): TableMetaContextValue {
  const ctx = useContext(TableMetaContext);
  if (!ctx) {
    throw new TypeError('useTableMeta must be used within AuthShellWrapper');
  }
  return ctx;
}

/**
 * Provides TableMetaContext for isolated component stories and tests.
 */
export function TableMetaProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });
  const value = useMemo(
    () => ({ tableMeta, setTableMeta }),
    [tableMeta, setTableMeta]
  );
  return (
    <TableMetaContext.Provider value={value}>
      {children}
    </TableMetaContext.Provider>
  );
}
