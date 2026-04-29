'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type {
  DspPresenceData,
  DspPresenceItem,
} from '@/app/app/(shell)/dashboard/presence/actions';
import { PageShell } from '@/components/organisms/PageShell';
import { useTableMeta } from '@/contexts/TableMetaContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { queryKeys } from '@/lib/queries/keys';
import { useDspEnrichmentStatusQuery } from '@/lib/queries/useDspEnrichmentStatusQuery';
import { AddPlatformDialog } from './AddPlatformDialog';
import { CatalogHealthSection } from './CatalogHealthSection';
import { DspPresenceEmptyState } from './DspPresenceEmptyState';
import { DspPresenceSidebar } from './DspPresenceSidebar';
import { DspPresenceSummary } from './DspPresenceSummary';
import { DspPresenceTable } from './DspPresenceTable';

// ============================================================================
// View component
// ============================================================================

interface DspPresenceViewProps {
  readonly data: DspPresenceData;
  readonly hasUnresolvedMismatches?: boolean;
}

export function DspPresenceView({
  data,
  hasUnresolvedMismatches = false,
}: DspPresenceViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [isAddPlatformDialogOpen, setIsAddPlatformDialogOpen] = useState(false);
  const dashboardData = useDashboardData();
  const queryClient = useQueryClient();

  const profileId = dashboardData.selectedProfile?.id ?? '';
  const isAdmin = dashboardData.isAdmin;
  const spotifyId = dashboardData.selectedProfile?.spotifyId ?? null;

  // Poll enrichment status and invalidate matches cache when discovery completes
  const onDiscoveryComplete = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.dspEnrichment.presence(profileId),
    });
  }, [queryClient, profileId]);

  const { data: enrichmentStatus } = useDspEnrichmentStatusQuery({
    profileId,
    onComplete: onDiscoveryComplete,
  });

  const existingProviderIds = useMemo(
    () => data.items.map(i => i.providerId),
    [data.items]
  );

  const selectedItem =
    data.items.find(i => i.matchId === selectedMatchId) ?? null;
  const isSidebarOpen = selectedItem !== null;

  const openAddPlatformDialog = useCallback(() => {
    // Delay opening so the initiating click is not treated as an outside
    // interaction by the controlled Radix dialog on the same event loop turn.
    globalThis.setTimeout(() => {
      setIsAddPlatformDialogOpen(true);
    }, 0);
  }, []);

  // Clear stale selection when item disappears from data (e.g. after reject)
  useEffect(() => {
    if (selectedMatchId && !selectedItem) {
      setSelectedMatchId(null);
    }
  }, [selectedMatchId, selectedItem]);

  // Shell integration: drawer toggle + right panel width
  const { setTableMeta } = useTableMeta();
  const itemsRef = useRef(data.items);
  itemsRef.current = data.items;

  useEffect(() => {
    const toggle = () => {
      if (isSidebarOpen) {
        setSelectedMatchId(null);
      } else if (itemsRef.current.length > 0) {
        setSelectedMatchId(itemsRef.current[0].matchId);
      }
    };

    setTableMeta({
      rowCount: data.items.length,
      toggle: data.items.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [selectedMatchId, data.items.length, isSidebarOpen]);

  // Row click: toggle sidebar
  const handleRowSelect = useCallback(
    (item: DspPresenceItem) => {
      setSelectedMatchId(
        item.matchId === selectedMatchId ? null : item.matchId
      );
    },
    [selectedMatchId]
  );

  const sidebarPanel = useMemo(() => {
    if (!selectedItem) {
      return null;
    }

    return (
      <DspPresenceSidebar
        item={selectedItem}
        onClose={() => setSelectedMatchId(null)}
      />
    );
  }, [selectedItem]);

  useRegisterRightPanel(sidebarPanel);

  const toolbar = (
    <DspPresenceSummary
      confirmedCount={data.confirmedCount}
      suggestedCount={data.suggestedCount}
      profileId={profileId}
      isAdmin={isAdmin}
      spotifyId={spotifyId}
      enrichmentStatus={enrichmentStatus}
      onAddPlatform={openAddPlatformDialog}
    />
  );

  if (data.items.length === 0) {
    return (
      <PageShell toolbar={toolbar} data-testid='dsp-presence-workspace'>
        <div
          className='flex h-full min-h-0 flex-1 items-center justify-center'
          data-testid='dsp-presence-content-panel'
        >
          <DspPresenceEmptyState onAddPlatform={openAddPlatformDialog} />
        </div>
        <AddPlatformDialog
          open={isAddPlatformDialogOpen}
          onClose={() => setIsAddPlatformDialogOpen(false)}
          existingProviderIds={existingProviderIds}
        />
      </PageShell>
    );
  }

  return (
    <PageShell toolbar={toolbar} data-testid='dsp-presence-workspace'>
      <div
        className='flex min-h-0 flex-1 overflow-hidden'
        data-testid='dsp-presence-content-panel'
      >
        <div className='flex-1 min-h-0 overflow-auto'>
          <DspPresenceTable
            items={data.items}
            selectedMatchId={selectedMatchId}
            onRowSelect={handleRowSelect}
          />
          <CatalogHealthSection
            profileId={profileId}
            spotifyId={spotifyId}
            hasUnresolvedMismatches={hasUnresolvedMismatches}
          />
        </div>
      </div>
      <AddPlatformDialog
        open={isAddPlatformDialogOpen}
        onClose={() => setIsAddPlatformDialogOpen(false)}
        existingProviderIds={existingProviderIds}
      />
    </PageShell>
  );
}
