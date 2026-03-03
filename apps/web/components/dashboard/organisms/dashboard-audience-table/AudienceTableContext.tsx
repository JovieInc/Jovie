'use client';

import { createContext, useContext } from 'react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { TouringCityInfo } from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';

interface AudienceTableContextValue {
  readonly selectedIds: Set<string>;
  readonly toggleSelect: (id: string) => void;
  readonly openMenuRowId: string | null;
  readonly setOpenMenuRowId: (id: string | null) => void;
  readonly getContextMenuItems: (
    member: AudienceMember
  ) => ContextMenuItemType[];
  readonly onExportMember: (member: AudienceMember) => void;
  readonly onBlockMember: (member: AudienceMember) => void;
  readonly onViewProfile: (member: AudienceMember) => void;
  readonly onSendNotification: (member: AudienceMember) => void;
  /** Get touring city info for a member (returns null if not in a touring city) */
  readonly getTouringCity: (member: AudienceMember) => TouringCityInfo | null;
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
