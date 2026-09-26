import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AccountSettingsSection } from './AccountSettingsSection';

const mockDashboardData: DashboardData = {
  user: { id: 'user_1' },
  creatorProfiles: [],
  selectedProfile: { id: 'profile_1' } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
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

function createAccountFetchMock(originalFetch: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/auth/get-session')) {
      return Response.json({
        user: {
          id: 'story-user',
          name: 'Ada Artist',
          email: 'artist@example.com',
          image: null,
          username: 'ada',
        },
        session: {
          id: 'story-session',
          userId: 'story-user',
          expiresAt: '2099-01-01T00:00:00Z',
        },
      });
    }
    if (url.endsWith('/api/account/sessions')) {
      return Response.json({
        sessions: [
          {
            id: 'session-current',
            ipAddress: '203.0.113.4',
            userAgent: 'Chrome on macOS',
            lastActiveAt: new Date(Date.now() - 2 * 60_000).toISOString(),
            isCurrent: true,
          },
          {
            id: 'session-other',
            ipAddress: '198.51.100.7',
            userAgent: 'Safari on iPhone',
            lastActiveAt: new Date(
              Date.now() - 3 * 24 * 60 * 60_000
            ).toISOString(),
            isCurrent: false,
          },
        ],
      });
    }
    if (url.includes('/api/account/sessions/')) {
      return new Response(null, { status: 204 });
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WithAccountFixtures({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createAccountFetchMock(globalThis.fetch);
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, []);

  return (
    <JovieAuthValuesProvider>
      <DashboardDataProvider value={mockDashboardData}>
        {children}
      </DashboardDataProvider>
    </JovieAuthValuesProvider>
  );
}

const meta: Meta<typeof AccountSettingsSection> = {
  title: 'Dashboard/Organisms/AccountSettings/AccountSettingsSection',
  component: AccountSettingsSection,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <WithAccountFixtures>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </WithAccountFixtures>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Growth: Story = {
  args: { isGrowth: true },
};
