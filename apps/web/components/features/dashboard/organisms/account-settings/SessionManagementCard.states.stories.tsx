import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { expect, within } from 'storybook/test';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
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

type MockMode =
  | 'pending'
  | 'sessions'
  | 'empty'
  | 'error'
  | 'recover'
  | 'reauth'
  | 'offline';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

function createSessionsApiMock(
  mode: MockMode,
  sessions: ReadonlyArray<Record<string, unknown>>
): NonNullable<ApiMockWindow['__jovieApiMock']> {
  let attempts = 0;
  return ({ url }) => {
    if (url.pathname.endsWith('/list-sessions')) {
      if (mode === 'pending') return new Promise<Response>(() => undefined);
      if (mode === 'offline')
        return Promise.reject(new TypeError('Failed to fetch'));
      if (mode === 'reauth')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'SESSION_NOT_FRESH',
              message: 'Session is not fresh',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        );
      if (mode === 'error' || (mode === 'recover' && attempts++ === 0)) {
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
      url.pathname.endsWith('/revoke-session') ||
      url.pathname.endsWith('/revoke-other-sessions')
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({ status: true }), { status: 200 })
      );
    }
    return undefined;
  };
}

// authClient pins `fetch` at module init (better-auth `customFetchImpl`), so
// replacing `globalThis.fetch` here never intercepts `listSessions`. The
// storybook preview's /api/* interceptor instead consults the live
// `window.__jovieApiMock` handler on every request.
function WithSessionsFetch({
  children,
  mode,
  sessions = [],
}: Readonly<{
  children: React.ReactNode;
  mode: MockMode;
  sessions?: ReadonlyArray<Record<string, unknown>>;
}>) {
  React.useLayoutEffect(() => {
    const apiMockWindow = window as ApiMockWindow;
    const previous = apiMockWindow.__jovieApiMock;
    apiMockWindow.__jovieApiMock = createSessionsApiMock(mode, sessions);
    return () => {
      apiMockWindow.__jovieApiMock = previous;
    };
  }, [mode, sessions]);

  return <>{children}</>;
}

function sessionsFetch(
  mode: MockMode,
  sessions: ReadonlyArray<Record<string, unknown>> = []
) {
  return function SessionsFetchDecorator(Story: React.ComponentType) {
    return (
      <WithSessionsFetch mode={mode} sessions={sessions}>
        <Story />
      </WithSessionsFetch>
    );
  };
}

function withPanel(Story: React.ComponentType) {
  return (
    <div className='max-w-2xl'>
      <SettingsPanel title='Active Sessions'>
        <Story />
      </SettingsPanel>
    </div>
  );
}

function withRtl(Story: React.ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for active-session management; same session mock as the base stories. */
const meta = {
  title: 'Dashboard/Organisms/AccountSettings/SessionManagementCard States',
  component: SessionManagementCard,
  parameters: { layout: 'padded' },
  args: { activeSessionId: CURRENT_SESSION.id },
  decorators: [withPanel],
} satisfies Meta<typeof SessionManagementCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Offline: the session list request cannot reach the network. */
export const OfflineListFailed: Story = {
  decorators: [sessionsFetch('offline')],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Retry' })
    ).toBeVisible();
  },
};

/** Permission denied: the session is no longer fresh, so the list needs a new sign-in. */
export const PermissionDeniedStaleSession: Story = {
  decorators: [sessionsFetch('reauth')],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Sign In Again',
      })
    ).toBeVisible();
  },
};

/** Right-to-left: two sessions inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    sessionsFetch('sessions', [CURRENT_SESSION, OTHER_SESSION]),
    withRtl,
  ],
};
