import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AccountSettingsSection } from './AccountSettingsSection';

const DASHBOARD_DATA = {
  selectedProfile: {
    id: 'story-profile',
    settings: { require_double_opt_in: true },
  },
} as DashboardData;

const SESSION_USER = {
  id: 'story-user',
  name: 'Ada Artist',
  email: 'artist@example.com',
  image: null,
  username: 'ada',
};

const SESSION = {
  id: 'story-session',
  userId: SESSION_USER.id,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

function createSignedInFetchMock(originalFetch: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/auth/get-session')) {
      return Promise.resolve(
        Response.json({ user: SESSION_USER, session: SESSION })
      );
    }
    if (url.includes('/list-sessions')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: SESSION.id,
              token: 'token-current',
              userAgent: 'Electron',
              createdAt: '2026-09-20T00:00:00.000Z',
              updatedAt: '2026-09-26T09:00:00.000Z',
              expiresAt: SESSION.expiresAt,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WithSignedInSession({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createSignedInFetchMock(globalThis.fetch);
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, []);

  return <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>;
}

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/AccountSettingsSection',
  component: AccountSettingsSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    isGrowth: false,
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={DASHBOARD_DATA}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
} satisfies Meta<typeof AccountSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const SignedIn: Story = {
  decorators: [
    Story => (
      <WithSignedInSession>
        <Story />
      </WithSignedInSession>
    ),
  ],
};
