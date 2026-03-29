'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type {
  DspPresenceData,
  DspPresenceItem,
} from '@/app/app/(shell)/dashboard/presence/actions';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { DashboardWorkspacePanel } from '@/features/dashboard/organisms/DashboardWorkspacePanel';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { DspPresenceCard } from './DspPresenceCard';
import { DspPresenceEmptyState } from './DspPresenceEmptyState';
import { DspPresenceSidebar } from './DspPresenceSidebar';
import { DspPresenceSummary } from './DspPresenceSummary';

// ============================================================================
// View component
// ============================================================================

interface DspPresenceViewProps {
  readonly data: DspPresenceData;
}

export function DspPresenceView({ data }: DspPresenceViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const dashboardData = useDashboardData();

  const profileId = dashboardData.selectedProfile?.id ?? '';
  const isAdmin = dashboardData.isAdmin;
  const spotifyId = dashboardData.selectedProfile?.spotifyId ?? null;
  const existingProviderIds = useMemo(
    () => data.items.map(i => i.providerId),
    [data.items]
  );

  const selectedItem =
    data.items.find(i => i.matchId === selectedMatchId) ?? null;
  const isSidebarOpen = selectedItem !== null;

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

  // Card click: toggle sidebar
  const handleCardClick = useCallback(
    (item: DspPresenceItem) => {
      setSelectedMatchId(
        item.matchId === selectedMatchId ? null : item.matchId
      );
    },
    [selectedMatchId]
  );

  // Keyboard navigation for card grid
  const gridRef = useRef<HTMLDivElement>(null);

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!gridRef.current) return;
      const cards = Array.from(
        gridRef.current.querySelectorAll<HTMLElement>('button[aria-pressed]')
      );
      const currentIndex = cards.indexOf(e.currentTarget);
      if (currentIndex === -1) return;

      // Compute column count from rendered grid to make vertical nav correct
      const cols =
        globalThis
          .getComputedStyle(gridRef.current)
          .gridTemplateColumns.split(' ').length || 1;

      let nextIndex: number;
      if (e.key === 'ArrowRight') {
        nextIndex = Math.min(currentIndex + 1, cards.length - 1);
      } else if (e.key === 'ArrowLeft') {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else if (e.key === 'ArrowDown') {
        nextIndex = Math.min(currentIndex + cols, cards.length - 1);
      } else if (e.key === 'ArrowUp') {
        nextIndex = Math.max(currentIndex - cols, 0);
      } else {
        return;
      }

      e.preventDefault();
      cards[nextIndex]?.focus();

      // Update sidebar selection if open
      if (selectedMatchId !== null && data.items[nextIndex]) {
        setSelectedMatchId(data.items[nextIndex].matchId);
      }
    },
    [selectedMatchId, data.items]
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
      existingProviderIds={existingProviderIds}
      profileId={profileId}
      isAdmin={isAdmin}
      spotifyId={spotifyId}
    />
  );

  if (data.items.length === 0) {
    return (
      <DashboardWorkspacePanel
        toolbar={toolbar}
        surfaceClassName='bg-[color-mix(in_oklab,var(--linear-bg-page)_72%,var(--linear-bg-surface-1))]'
        data-testid='dsp-presence-workspace'
      >
        <DspPresenceEmptyState existingProviderIds={existingProviderIds} />
      </DashboardWorkspacePanel>
    );
  }

  return (
    <DashboardWorkspacePanel
      toolbar={toolbar}
      surfaceClassName='bg-[color-mix(in_oklab,var(--linear-bg-page)_72%,var(--linear-bg-surface-1))]'
      data-testid='dsp-presence-workspace'
    >
      <div className='flex-1 min-h-0 overflow-auto'>
        <div
          ref={gridRef}
          className='grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3'
        >
          {data.items.map(item => (
            <DspPresenceCard
              key={item.matchId}
              item={item}
              isSelected={selectedMatchId === item.matchId}
              onClick={() => handleCardClick(item)}
              onKeyDown={handleCardKeyDown}
            />
          ))}
        </div>
      </div>
    </DashboardWorkspacePanel>
  );
}
