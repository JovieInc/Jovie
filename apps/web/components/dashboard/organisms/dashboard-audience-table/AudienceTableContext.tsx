'use client';

import { createContext, useContext } from 'react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { TouringCityInfo } from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';

/**
 * Stable context: callbacks and functions that rarely change.
 * Consumers of this context will NOT re-render on selection or menu toggle.
 */
interface AudienceTableStableContextValue {
  readonly toggleSelect: (id: string) => void;
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

/**
 * Volatile context: frequently-changing state (selection + open menu).
 * Only cells that truly depend on these values (SelectCell, LastSeenCell)
 * subscribe here and re-render on changes.
 */
interface AudienceTableVolatileContextValue {
  readonly selectedIds: Set<string>;
  readonly openMenuRowId: string | null;
}

const AudienceTableStableContext =
  createContext<AudienceTableStableContextValue | null>(null);

const AudienceTableVolatileContext =
  createContext<AudienceTableVolatileContextValue | null>(null);

export function useAudienceTableStableContext(): AudienceTableStableContextValue {
  const ctx = useContext(AudienceTableStableContext);
  if (!ctx) {
    throw new Error(
      'useAudienceTableStableContext must be used within AudienceTableProviders'
    );
  }
  return ctx;
}

export function useAudienceTableVolatileContext(): AudienceTableVolatileContextValue {
  const ctx = useContext(AudienceTableVolatileContext);
  if (!ctx) {
    throw new Error(
      'useAudienceTableVolatileContext must be used within AudienceTableProviders'
    );
  }
  return ctx;
}

/**
 * Convenience hook for the full context value (combines stable + volatile).
 * Use the targeted hooks (useAudienceTableStableContext /
 * useAudienceTableVolatileContext) when a cell only needs one slice so it
 * avoids spurious re-renders from the other.
 */
export function useAudienceTableContext(): AudienceTableStableContextValue &
  AudienceTableVolatileContextValue {
  const stable = useAudienceTableStableContext();
  const volatile = useAudienceTableVolatileContext();
  return { ...stable, ...volatile };
}

export const AudienceTableStableProvider = AudienceTableStableContext.Provider;
export const AudienceTableVolatileProvider =
  AudienceTableVolatileContext.Provider;
