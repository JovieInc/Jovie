import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceSidebar } from './DspPresenceSidebar';

/**
 * Certification states for the DSP presence sidebar. The suggested match and
 * empty defaults live in DspPresenceSidebar.stories.tsx.
 */

const PROFILE_ID = '5b4f7a52-2f7e-4c2a-9a55-1f0e0c3d9a10';
const MATCH_ID = '0e7c1d8e-3a9b-4f51-8f0a-2d6c4b1e7a33';

const dashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: { id: PROFILE_ID },
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
} as unknown as DashboardData;

const suggestedItem: DspPresenceItem = {
  matchId: MATCH_ID,
  providerId: 'spotify',
  status: 'suggested',
  confidenceScore: 0.91,
  matchingIsrcCount: 3,
  matchSource: 'isrc_discovery',
  confirmedAt: null,
  externalArtistName: 'Midnight Echo',
  externalArtistUrl: 'https://open.spotify.com/artist/123',
  externalArtistImageUrl: null,
  confidenceBreakdown: null,
};

function pendingMatchFetch(originalFetch: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/dsp/matches/'))
      return new Promise<Response>(() => {});
    return originalFetch(input, init);
  }) as typeof fetch;
}

function SidebarProviders({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const client = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
          mutations: { retry: false },
        },
      }),
    []
  );
  return (
    <QueryClientProvider client={client}>
      <DashboardDataProvider value={dashboardData}>
        {children}
      </DashboardDataProvider>
    </QueryClientProvider>
  );
}

function PendingFetch({ children }: { readonly children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    const mocked = pendingMatchFetch(originalFetch);
    globalThis.fetch = mocked;
    setReady(true);
    return () => {
      if (globalThis.fetch === mocked) globalThis.fetch = originalFetch;
    };
  }, []);
  return ready ? children : null;
}

const SidebarDecorator: Decorator = function SidebarDecorator(Story) {
  return (
    <SidebarProviders>
      <Story />
    </SidebarProviders>
  );
};

const PendingDecorator: Decorator = function PendingDecorator(Story) {
  return (
    <PendingFetch>
      <Story />
    </PendingFetch>
  );
};

const RtlDecorator: Decorator = function RtlDecorator(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/DspPresence/DspPresenceSidebar/States',
  component: DspPresenceSidebar,
  args: { item: suggestedItem, onClose: fn() },
  decorators: [SidebarDecorator],
} satisfies Meta<typeof DspPresenceSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: Confirm Match was pressed and the request is still in flight. */
export const LoadingConfirmingMatch: Story = {
  decorators: [PendingDecorator],
  play: async function playConfirm({ canvasElement }) {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Confirm Match' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Confirming...' })
    ).toBeInTheDocument();
  },
};

/** Long content: a very long artist name with a confirmed manual link. */
export const LongContentArtistName: Story = {
  args: {
    item: {
      ...suggestedItem,
      status: 'confirmed',
      matchSource: 'manual',
      confirmedAt: '2026-04-01T12:00:00.000Z',
      matchingIsrcCount: 1284,
      externalArtistName:
        'The Extraordinarily Long Named Orchestra And Friends Featuring Everyone',
    },
  },
};

/** Right-to-left: an Arabic artist name in a right-to-left document. */
export const RtlArabicArtist: Story = {
  decorators: [RtlDecorator],
  args: {
    item: { ...suggestedItem, externalArtistName: 'صدى منتصف الليل' },
  },
};
