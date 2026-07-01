'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface DrawerSectionGroupContextValue {
  readonly openSectionId: string | null;
  readonly toggleSection: (sectionId: string) => void;
}

const DrawerSectionGroupContext =
  createContext<DrawerSectionGroupContextValue | null>(null);

export function useDrawerSectionGroup(): DrawerSectionGroupContextValue | null {
  return useContext(DrawerSectionGroupContext);
}

export interface DrawerSectionGroupProps {
  readonly children: ReactNode;
  /** Section id that starts open. When omitted, all sections start collapsed. */
  readonly defaultOpenSectionId?: string | null;
}

export function DrawerSectionGroup({
  children,
  defaultOpenSectionId = null,
}: DrawerSectionGroupProps) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    defaultOpenSectionId
  );

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSectionId(previous => (previous === sectionId ? null : sectionId));
  }, []);

  const value = useMemo(
    () => ({ openSectionId, toggleSection }),
    [openSectionId, toggleSection]
  );

  return (
    <DrawerSectionGroupContext.Provider value={value}>
      {children}
    </DrawerSectionGroupContext.Provider>
  );
}
