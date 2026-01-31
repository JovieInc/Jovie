import * as React from 'react';

type TableMeta = {
  rowCount: number | null;
  toggle?: (() => void) | null;
  rightPanelWidth?: number | null;
};

type TableMetaContextValue = {
  tableMeta: TableMeta;
  setTableMeta: (meta: TableMeta) => void;
};

const TableMetaContext = React.createContext<TableMetaContextValue | null>(
  null
);

export function useTableMeta(): TableMetaContextValue {
  const ctx = React.useContext(TableMetaContext);
  if (!ctx) {
    return {
      tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
      setTableMeta: () => {
        // no-op
      },
    };
  }
  return ctx;
}

export interface DashboardLayoutClientProps {
  readonly children: React.ReactNode;
}

export default function DashboardLayoutClient({
  children,
}: DashboardLayoutClientProps) {
  const [tableMeta, setTableMeta] = React.useState<TableMeta>({
    rowCount: null,
    toggle: null,
    rightPanelWidth: null,
  });

  const contextValue = React.useMemo(
    () => ({ tableMeta, setTableMeta }),
    [tableMeta]
  );

  return (
    <TableMetaContext.Provider value={contextValue}>
      {children}
    </TableMetaContext.Provider>
  );
}
