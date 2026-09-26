import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { SessionManagementCard } from './SessionManagementCard';

interface StorySession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly lastActiveAt: string;
  readonly isCurrent: boolean;
}

const NOW = Date.now();

const CURRENT_SESSION: StorySession = {
  id: 'session-current',
  ipAddress: '203.0.113.4',
  userAgent: 'Chrome on macOS',
  lastActiveAt: new Date(NOW - 2 * 60_000).toISOString(),
  isCurrent: true,
};

const OTHER_SESSION: StorySession = {
  id: 'session-other',
  ipAddress: '198.51.100.7',
  userAgent: 'Safari on iPhone',
  lastActiveAt: new Date(NOW - 3 * 24 * 60 * 60_000).toISOString(),
  isCurrent: false,
};

function createSessionsFetchMock(
  sessions: readonly StorySession[] | 'error',
  originalFetch: typeof fetch
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/account/sessions')) {
      if (sessions === 'error') {
        return new Response('Internal error', { status: 500 });
      }
      return Response.json({ sessions });
    }
    if (url.includes('/api/account/sessions/')) {
      return new Response(null, { status: 204 });
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WithSessions({
  children,
  sessions,
}: Readonly<{
  children: React.ReactNode;
  sessions: readonly StorySession[] | 'error';
}>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createSessionsFetchMock(sessions, globalThis.fetch);
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, [sessions]);

  return <>{children}</>;
}

const meta: Meta<typeof SessionManagementCard> = {
  title: 'Dashboard/Organisms/AccountSettings/SessionManagementCard',
  component: SessionManagementCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <div className='max-w-2xl rounded-xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story => (
      <WithSessions sessions={[CURRENT_SESSION, OTHER_SESSION]}>
        <Story />
      </WithSessions>
    ),
  ],
};

export const CurrentDeviceOnly: Story = {
  decorators: [
    Story => (
      <WithSessions sessions={[CURRENT_SESSION]}>
        <Story />
      </WithSessions>
    ),
  ],
};

export const LoadFailed: Story = {
  decorators: [
    Story => (
      <WithSessions sessions='error'>
        <Story />
      </WithSessions>
    ),
  ],
};
