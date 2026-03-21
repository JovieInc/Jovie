'use client';

import {
  useAuth,
  useClerk,
  useSession,
  useSignIn,
  useSignUp,
  useUser,
} from '@clerk/nextjs';
import { type ReactNode, useMemo } from 'react';
import {
  ClerkSafeContextProvider,
  type ClerkSafeContextValue,
} from '@/hooks/useClerkSafe';

export function ClerkSafeValuesProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const clerk = useClerk();
  const user = useUser();
  const auth = useAuth();
  const session = useSession();
  const signIn = useSignIn();
  const signUp = useSignUp();

  const value = useMemo<ClerkSafeContextValue>(
    () => ({ clerk, user, auth, session, signIn, signUp }),
    [clerk, user, auth, session, signIn, signUp]
  );

  return (
    <ClerkSafeContextProvider value={value}>
      {children}
    </ClerkSafeContextProvider>
  );
}
