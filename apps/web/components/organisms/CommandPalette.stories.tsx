import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { queryKeys } from '@/lib/queries/keys';
import { CommandPalette, CommandPaletteMainSurface } from './CommandPalette';

const STORY_PROFILE_ID = 'command-palette-story-profile';

const storyQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

storyQueryClient.setQueryData(queryKeys.releases.matrix(STORY_PROFILE_ID), []);
storyQueryClient.setQueryData(queryKeys.chat.conversations(), [
  {
    id: 'story-thread',
    title: 'Plan the next release',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    latestTurnStatus: 'completed',
  },
]);
storyQueryClient.setQueryData(queryKeys.chat.capabilities(STORY_PROFILE_ID), {
  tools: {
    albumArt: {
      availability: 'available',
      reason: null,
      reasonCode: null,
    },
  },
});

const storyDashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: { id: STORY_PROFILE_ID },
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 100,
    completedCount: 1,
    totalCount: 1,
    steps: [],
    profileIsLive: true,
  },
} as DashboardData;

function OpenPaletteOnMount() {
  const { openCommandPalette } = useHeaderActions();
  useEffect(() => {
    openCommandPalette();
  }, [openCommandPalette]);
  return null;
}

function PaletteHeaderSlot() {
  const { commandPaletteHeader } = useHeaderActions();
  return (
    <header className='flex h-12 shrink-0 items-center border-b border-(--app-shell-frame-seam) px-3.5'>
      {commandPaletteHeader}
    </header>
  );
}

function CommandPaletteStorySurface() {
  return (
    <QueryClientProvider client={storyQueryClient}>
      <DashboardDataContext.Provider value={storyDashboardData}>
        <HeaderActionsProvider>
          <div className='flex h-[44rem] w-[min(64rem,100vw)] flex-col overflow-hidden bg-(--app-shell-content-surface)'>
            <PaletteHeaderSlot />
            <CommandPaletteMainSurface />
          </div>
          <CommandPalette />
          <OpenPaletteOnMount />
        </HeaderActionsProvider>
      </DashboardDataContext.Provider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/CommandPalette',
  component: CommandPalette,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // These belong to the private CommandPaletteInner adapter. The story
      // exercises them through the public controller + main-surface pairing.
      uncoveredProps: ['profileId', 'open', 'onOpenChange', 'presentation'],
    },
  },
  render: () => <CommandPaletteStorySurface />,
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoundedDefaults: Story = {};
