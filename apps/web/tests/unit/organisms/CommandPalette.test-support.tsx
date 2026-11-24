import type { ReactNode } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CommandPaletteMainSurface } from '@/components/organisms/CommandPalette';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
export function makeDashboard(isAdmin = false): DashboardData {
  return {
    user: { id: 'user-1' },
    creatorProfiles: [],
    selectedProfile: { id: 'profile-1' } as DashboardData['selectedProfile'],
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin,
    tippingStats: {
      tipClicks: 0,
      qrTipClicks: 0,
      linkTipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: {
      percentage: 0,
      completedCount: 0,
      totalCount: 0,
      steps: [],
      profileIsLive: false,
    },
  };
}

function CommandPaletteHeaderHarness() {
  const { commandPaletteHeader } = useHeaderActions();
  return <div>{commandPaletteHeader}</div>;
}

export function CommandPaletteState() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return (
    <output aria-label='Command palette state'>
      {isCommandPaletteOpen ? 'open' : 'closed'}
    </output>
  );
}

export function withDashboard(
  node: ReactNode,
  isAdmin = false,
  mountMainSurface = true
) {
  const dashboard = makeDashboard(isAdmin);

  return (
    <DashboardDataContext.Provider
      value={{
        ...dashboard,
        identities: dashboard.creatorProfiles,
        activeIdentity: dashboard.selectedProfile,
      }}
    >
      <HeaderActionsProvider>
        {node}
        {mountMainSurface && <CommandPaletteMainSurface />}
        <CommandPaletteHeaderHarness />
      </HeaderActionsProvider>
    </DashboardDataContext.Provider>
  );
}
