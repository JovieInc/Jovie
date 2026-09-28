import type { Decorator } from '@storybook/nextjs-vite';
import React from 'react';

/**
 * Shared signed-in Better Auth fixture for Storybook stories.
 *
 * `authClient.useSession()` resolves `GET /api/auth/get-session`, which the
 * preview fetch catch-all answers with `null` (signed out). Stories that
 * exercise signed-in surfaces install this interceptor through the
 * `withSignedInSession` decorator.
 *
 * The handler registers on `window.__jovieApiMock`, which the preview's
 * /api/* interceptor consults on every request. This reaches clients like
 * better-auth's `authClient` that pin `fetch` at module init — swapping
 * `globalThis.fetch` inside a decorator can never intercept them.
 */

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

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

export function createSignedInApiMock(): NonNullable<
  ApiMockWindow['__jovieApiMock']
> {
  return ({ url }) => {
    if (url.pathname.endsWith('/get-session')) {
      return Response.json({
        user: SIGNED_IN_USER,
        session: SIGNED_IN_SESSION,
      });
    }
    if (url.pathname.endsWith('/list-sessions')) {
      return Response.json(SIGNED_IN_SESSIONS_LIST);
    }
    return undefined;
  };
}

function SignedInSessionBoundary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Register during first render so the mock precedes any descendant's
  // mount-time session fetch; restore the previous handler on unmount.
  const restoreRef = React.useRef<(() => void) | null>(null);
  if (restoreRef.current === null && typeof window !== 'undefined') {
    const apiMockWindow = window as ApiMockWindow;
    const previous = apiMockWindow.__jovieApiMock;
    apiMockWindow.__jovieApiMock = createSignedInApiMock();
    restoreRef.current = () => {
      apiMockWindow.__jovieApiMock = previous;
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
