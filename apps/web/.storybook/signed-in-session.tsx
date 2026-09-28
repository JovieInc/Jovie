import type { Decorator } from '@storybook/nextjs-vite';
import React from 'react';

/**
 * Shared signed-in Better Auth fixture for Storybook stories.
 *
 * `authClient.useSession()` resolves `GET /api/auth/get-session`, which the
 * preview fetch catch-all answers with `{}` — a truthy body with no
 * `session`/`user`, so consumers that mount `JovieAuthValuesProvider` crash.
 * Stories that exercise signed-in surfaces install this interceptor through
 * the `withSignedInSession` decorator; it patches `window.fetch` before the
 * provider mounts and restores the previous handler on unmount.
 */

const SIGNED_IN_USER = {
  id: 'story-user',
  name: 'Tim White',
  email: 'tim@example.com',
  image: null,
  username: 'timwhite',
};

const SIGNED_IN_SESSION = {
  id: 'story-session',
  userId: SIGNED_IN_USER.id,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const SIGNED_IN_SESSIONS_LIST = [
  {
    id: SIGNED_IN_SESSION.id,
    token: 'token-current',
    userAgent: 'Electron',
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-26T09:00:00.000Z',
    expiresAt: SIGNED_IN_SESSION.expiresAt,
  },
];

function createSignedInFetchMock(nextFetch: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/auth/get-session')) {
      return Promise.resolve(
        Response.json({ user: SIGNED_IN_USER, session: SIGNED_IN_SESSION })
      );
    }
    if (url.includes('/list-sessions')) {
      return Promise.resolve(Response.json(SIGNED_IN_SESSIONS_LIST));
    }
    return nextFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function SignedInSessionBoundary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Install during first render so the patch precedes any descendant's
  // mount-time session fetch; restore on unmount.
  const restoreRef = React.useRef<(() => void) | null>(null);
  if (restoreRef.current === null) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createSignedInFetchMock(originalFetch);
    restoreRef.current = () => {
      globalThis.fetch = originalFetch;
    };
  }
  React.useEffect(
    () => () => {
      restoreRef.current?.();
      restoreRef.current = null;
    },
    []
  );
  return children;
}

export const withSignedInSession: Decorator = Story => (
  <SignedInSessionBoundary>
    <Story />
  </SignedInSessionBoundary>
);
