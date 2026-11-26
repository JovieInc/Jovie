'use client';

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import type { SidebarDockStatus } from './SidebarDock';

const StatusContext = createContext<SidebarDockStatus | undefined>(undefined);
const PublishContext = createContext<
  (status: SidebarDockStatus | undefined) => void
>(() => {});

/**
 * Carries the dock's icon-rail status from the footer (where the dock lives)
 * to the identity row at the top. `children` is passed through untouched, so a
 * status change re-renders only the consumers, never the sidebar tree.
 */
export function SidebarDockStatusProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [status, setStatus] = useState<SidebarDockStatus | undefined>();
  const publish = useCallback(
    (next: SidebarDockStatus | undefined) =>
      setStatus(prev => (prev?.label === next?.label ? prev : next)),
    []
  );
  return createElement(
    PublishContext.Provider,
    { value: publish },
    createElement(StatusContext.Provider, { value: status }, children)
  );
}

export const useSidebarDockStatus = () => useContext(StatusContext);
export const usePublishSidebarDockStatus = () => useContext(PublishContext);
