import * as React from 'react';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { type TableMeta, TableMetaContext } from '@/contexts/TableMetaContext';

export { TableMetaProvider } from '@/contexts/TableMetaContext';

// Provide the app's real TableMetaContext: components import useTableMeta
// from '@/contexts/TableMetaContext' directly, and a private mock context
// left them throwing "useTableMeta must be used within AuthShellWrapper"
// inside aliased shells (DemoReleasesExperience, FounderDemoRecordingSurface).
export function useTableMeta(): NonNullable<
  React.ContextType<typeof TableMetaContext>
> {
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
      {/* The same registries the real shell owns, so aliased shell content
          (ReleaseProviderMatrix) can register header actions and rails. */}
      <HeaderActionsProvider>
        <RightPanelProvider>
          <PreviewPanelProvider>{children}</PreviewPanelProvider>
        </RightPanelProvider>
      </HeaderActionsProvider>
    </TableMetaContext.Provider>
  );
}

// Storybook aliases the real named-export module to this lightweight mock.
// Export the same binding under both contracts so aliased shell stories keep
// the table metadata provider without loading the authenticated app shell.
export { DashboardLayoutClient as AuthShellWrapper };
