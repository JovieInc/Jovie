import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { SessionManagementCard } from './SessionManagementCard';

const CURRENT_SESSION = {
  id: 'session-current',
  token: 'token-current',
  userAgent: 'Electron',
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-26T09:00:00.000Z',
  expiresAt: '2026-10-26T09:00:00.000Z',
};

const OTHER_SESSION = {
  id: 'session-other',
  token: 'token-other',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-25T12:00:00.000Z',
  expiresAt: '2026-10-25T12:00:00.000Z',
};

type MockMode = 'pending' | 'sessions' | 'empty' | 'error';

function createSessionsFetchMock(
  mode: MockMode,
  sessions: ReadonlyArray<Record<string, unknown>>,
  originalFetch: typeof fetch
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/list-sessions')) {
      if (mode === 'pending') return new Promise<Response>(() => undefined);
      if (mode === 'error') {
        return Promise.resolve(new Response('Internal error', { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(mode === 'empty' ? [] : sessions), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    if (
      url.includes('/revoke-session') ||
      url.includes('/revoke-other-sessions')
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({ status: true }), { status: 200 })
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WithSessionsFetch({
  children,
  mode,
  sessions = [],
}: Readonly<{
  children: React.ReactNode;
  mode: MockMode;
  sessions?: ReadonlyArray<Record<string, unknown>>;
}>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createSessionsFetchMock(
      mode,
      sessions,
      globalThis.fetch
    );
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, [mode, sessions]);

  return <>{children}</>;
}

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/SessionManagementCard',
  component: SessionManagementCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    activeSessionId: CURRENT_SESSION.id,
  },
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionManagementCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentDeviceOnly: Story = {
  decorators: [
    Story => (
      <WithSessionsFetch mode='sessions' sessions={[CURRENT_SESSION]}>
        <Story />
      </WithSessionsFetch>
    ),
  ],
};

export const MultipleSessions: Story = {
  decorators: [
    Story => (
      <WithSessionsFetch
        mode='sessions'
        sessions={[CURRENT_SESSION, OTHER_SESSION]}
      >
        <Story />
      </WithSessionsFetch>
    ),
  ],
};

export const Loading: Story = {
  decorators: [
    Story => (
      <WithSessionsFetch mode='pending'>
        <Story />
      </WithSessionsFetch>
    ),
  ],
};

export const Empty: Story = {
  decorators: [
    Story => (
      <WithSessionsFetch mode='empty'>
        <Story />
      </WithSessionsFetch>
    ),
  ],
};

export const ErrorState: Story = {
  decorators: [
    Story => (
      <WithSessionsFetch mode='error'>
        <Story />
      </WithSessionsFetch>
    ),
  ],
};
