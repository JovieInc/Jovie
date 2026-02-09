'use client';

import { createContext, useContext } from 'react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';

interface AudienceTableContextValue {
  readonly selectedIds: Set<string>;
  readonly toggleSelect: (id: string) => void;
  readonly page: number;
  readonly pageSize: number;
  readonly openMenuRowId: string | null;
  readonly setOpenMenuRowId: (id: string | null) => void;
  readonly getContextMenuItems: (
    member: AudienceMember
  ) => ContextMenuItemType[];
}

const AudienceTableContext = createContext<AudienceTableContextValue | null>(
  null
);

export function useAudienceTableContext(): AudienceTableContextValue {
  const ctx = useContext(AudienceTableContext);
  if (!ctx) {
    throw new Error(
      'useAudienceTableContext must be used within AudienceTableProvider'
    );
  }
  return ctx;
}

export const AudienceTableProvider = AudienceTableContext.Provider;
