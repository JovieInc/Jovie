'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';

interface AdminPeopleRightPanelContextValue {
  readonly setPanel: (panel: ReactNode) => void;
}

const AdminPeopleRightPanelContext =
  createContext<AdminPeopleRightPanelContextValue | null>(null);

/**
 * The Admin People tabs share one shell-level right-panel owner. Individual
 * tables supply their selected detail surface, while the authenticated shell
 * remains the only desktop width/allocation owner.
 */
export function AdminPeopleRightPanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [panel, setPanel] = useState<ReactNode>(null);
  useRegisterRightPanel(panel);

  const value = useMemo(() => ({ setPanel }), [setPanel]);

  return (
    <AdminPeopleRightPanelContext.Provider value={value}>
      {children}
    </AdminPeopleRightPanelContext.Provider>
  );
}

/** Register the active Admin People tab's detail surface with the shared rail. */
export function useAdminPeopleRightPanel(panel: ReactNode) {
  const context = useContext(AdminPeopleRightPanelContext);
  if (!context) {
    throw new TypeError(
      'useAdminPeopleRightPanel must be used within AdminPeopleRightPanelProvider'
    );
  }

  useEffect(() => {
    context.setPanel(panel);
    return () => context.setPanel(null);
  }, [context, panel]);
}
