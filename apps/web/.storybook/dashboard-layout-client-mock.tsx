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

export function TableMetaProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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

// Storybook aliases the real named-export module to this lightweight mock.
// Export the same binding under both contracts so aliased shell stories keep
// the table metadata provider without loading the authenticated app shell.
export { DashboardLayoutClient as AuthShellWrapper };
