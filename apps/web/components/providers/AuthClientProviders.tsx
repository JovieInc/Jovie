'use client';

import { type ReactNode } from 'react';
import { ClerkSafeValuesProvider } from '@/hooks/useClerkSafe';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
  readonly forceEnableClerk?: boolean;
  readonly publishableKey?: string | undefined;
}

function wrapChildren(children: ReactNode) {
  return <QueryProvider>{children}</QueryProvider>;
}

/**
 * Auth-scoped client providers (Clerk → Better Auth migration, client-flip
 * commit ⑦). Better Auth needs no provider — `authClient.useSession()` reads
 * the session cookie directly. The context fan-out from `useJovieAuth` is
 * mounted via `ClerkSafeValuesProvider` (an alias for
 * `JovieAuthValuesProvider`) so `useUserSafe`/`useAuthSafe`/`useSessionSafe`
 * consumers inside the (auth)/ and @auth layouts keep working.
 *
 * The legacy `forceEnableClerk` / `publishableKey` props are kept in the
 * interface for source compatibility with `(auth)/layout.tsx` and
 * `@auth/layout.tsx` but are functionally inert under Better Auth.
 */
export function AuthClientProviders({
  children,
  forceEnableClerk = false,
  publishableKey,
}: AuthClientProvidersProps) {
  // `forceEnableClerk` was the "always mount ClerkProvider on auth pages"
  // signal. Under BA there is no provider to mount — the values provider is
  // always the right choice. `publishableKey` is unused.
  void forceEnableClerk;
  void publishableKey;

  return (
    <ClerkSafeValuesProvider>{wrapChildren(children)}</ClerkSafeValuesProvider>
  );
}
