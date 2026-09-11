'use client';

import { type ReactNode } from 'react';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
}

function wrapChildren(children: ReactNode) {
  return <QueryProvider>{children}</QueryProvider>;
}

/**
 * Auth-scoped client providers. Better Auth needs no vendor provider —
 * `authClient.useSession()` reads the session cookie. The values provider
 * fans session slices out so `useUserSafe` / `useAuthSafe` / `useSessionSafe`
 * consumers inside `(auth)/` and `@auth` keep working.
 */
export function AuthClientProviders({ children }: AuthClientProvidersProps) {
  return (
    <JovieAuthValuesProvider>{wrapChildren(children)}</JovieAuthValuesProvider>
  );
}
