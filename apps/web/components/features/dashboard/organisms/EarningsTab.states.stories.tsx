import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { EarningsResponse } from '@/lib/queries/useEarningsQuery';
import { EarningsTab } from './EarningsTab';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the earnings request the way a story asks; returns a restore. */
function stubEarnings(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/dashboard/earnings'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

function respondWith(body: EarningsResponse) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
}

const dashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: {
    id: 'profile-earnings',
    username: 'midnightsignal',
    usernameNormalized: 'midnightsignal',
    displayName: 'Midnight Signal',
  },
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
} as unknown as DashboardData;

type TabMeta = Meta<typeof EarningsTab>;

/** A fresh query client and the dashboard profile for every story. */
const EarningsProvidersDecorator: NonNullable<TabMeta['decorators']> =
  function EarningsProvidersDecorator(Story, context) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const data =
      (context.parameters.dashboardData as DashboardData) ?? dashboardData;
    const rtl = context.parameters.rtl === true;
    return (
      <QueryClientProvider client={client}>
        <DashboardDataProvider value={data}>
          <div
            dir={rtl ? 'rtl' : undefined}
            lang={rtl ? 'ar' : undefined}
            className='max-w-3xl'
          >
            <Story />
          </div>
        </DashboardDataProvider>
      </QueryClientProvider>
    );
  };

/**
 * Rendered states of the earnings tab. The default tab lives in
 * EarningsTab.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Earnings/EarningsTab/States',
  component: EarningsTab,
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['label', 'value', 'icon', 'dataUrl', 'isLoading'],
    },
  },
  decorators: [EarningsProvidersDecorator],
} satisfies TabMeta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the earnings request is in flight, so the stat cards are placeholders. */
export const LoadingEarnings: Story = {
  beforeEach: () => stubEarnings(() => new Promise<Response>(() => {})),
};

/** Empty: the profile has no handle yet, so there is no tip page to share. */
export const EmptyNoHandle: Story = {
  parameters: {
    dashboardData: { ...dashboardData, selectedProfile: null },
  },
};

/** Long content: large totals and tippers with long names and addresses. */
export const LongContentTippers: Story = {
  beforeEach: () =>
    stubEarnings(
      respondWith({
        stats: {
          totalRevenueCents: 987_654_321,
          totalTips: 123_456,
          averageTipCents: 8_000,
        },
        tippers: [1, 2, 3].map(n => ({
          id: `tipper-${n}`,
          tipperName: `A Very Devoted Long-Time Fan With A Long Name ${n}`,
          contactEmail: `a.very.devoted.long.time.fan.number.${n}@example.com`,
          amountCents: 25_000,
          createdAt: '2026-11-01T12:00:00.000Z',
        })),
      })
    ),
};

/** Right-to-left: Arabic tipper names in an RTL document. */
export const RtlArabicTippers: Story = {
  parameters: { rtl: true },
  beforeEach: () =>
    stubEarnings(
      respondWith({
        stats: {
          totalRevenueCents: 4_500,
          totalTips: 3,
          averageTipCents: 1_500,
        },
        tippers: [
          {
            id: 'tipper-ar',
            tipperName: 'معجب مخلص',
            contactEmail: null,
            amountCents: 1_500,
            createdAt: '2026-11-01T12:00:00.000Z',
          },
        ],
      })
    ),
};

/** Error: the earnings request fails, so the stats fall back to zero totals. */
export const ErrorEarningsUnavailable: Story = {
  beforeEach: () =>
    stubEarnings(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Internal error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      )
    ),
};

/** Offline: the network is down, so the request rejects and the stats fall back to zero. */
export const OfflineEarnings: Story = {
  beforeEach: () =>
    stubEarnings(() => Promise.reject(new TypeError('Failed to fetch'))),
};
