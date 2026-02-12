'use client';

import {
  useAuth as useAuthOriginal,
  useSignIn as useSignInOriginal,
  useSession as useSessionOriginal,
  useUser as useUserOriginal,
} from '@clerk/nextjs';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

// Derive types from the actual hook return types
type UseUserReturn = ReturnType<typeof useUserOriginal>;
type UseAuthReturn = ReturnType<typeof useAuthOriginal>;
type UseSessionReturn = ReturnType<typeof useSessionOriginal>;
type UseSignInReturn = ReturnType<typeof useSignInOriginal>;

/**
 * Context to track whether Clerk is available in the current provider tree.
 * When Clerk is bypassed (e.g., missing publishableKey or mock mode),
 * this context will be false and safe hooks will return defaults.
 */
const ClerkAvailabilityContext = createContext<boolean>(false);

interface ClerkAvailabilityProviderProps {
  readonly children: ReactNode;
  readonly isAvailable: boolean;
}

/**
 * Provider that indicates whether Clerk is available.
 * Wrap your app with this to enable safe Clerk hooks.
 */
export function ClerkAvailabilityProvider({
  children,
  isAvailable,
}: ClerkAvailabilityProviderProps) {
  return (
    <ClerkAvailabilityContext.Provider value={isAvailable}>
      {children}
    </ClerkAvailabilityContext.Provider>
  );
}

/**
 * Hook to check if Clerk is available in the current context.
 */
export function useClerkAvailable(): boolean {
  return useContext(ClerkAvailabilityContext);
}

/**
 * Default return value when Clerk is not available.
 * Matches the shape of useUser() return type.
 */
const DEFAULT_USER_RETURN: UseUserReturn = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
};

/**
 * Default return value when Clerk is not available.
 * Matches the shape of useAuth() return type.
 */
const DEFAULT_AUTH_RETURN: UseAuthReturn = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  sessionClaims: null,
  actor: null,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  has: () => false,
  signOut: async () => {},
  getToken: async () => null,
};

/**
 * Default return value when Clerk is not available.
 * Matches the shape of useSession() return type.
 */
const DEFAULT_SESSION_RETURN: UseSessionReturn = {
  isLoaded: true,
  isSignedIn: false,
  session: null,
};

/**
 * Default return value when Clerk is not available.
 * Matches the shape of useSignIn() return type.
 */
const DEFAULT_SIGN_IN_RETURN: UseSignInReturn = {
  isLoaded: true,
  signIn: null,
  setActive: async () => undefined,
};

// ============================================================================
// Context-based Safe Hooks
// ============================================================================
// These hooks are designed to be used in components that may render both
// inside and outside of ClerkProvider. When outside, they return safe defaults.
//
// ARCHITECTURE: The parent provider populates a context with either real Clerk
// hook values (when ClerkProvider is present) or default values (when bypassed).
// Consumer hooks read from this context, avoiding the need to conditionally
// call Clerk hooks.
// ============================================================================

interface ClerkSafeContextValue {
  user: UseUserReturn;
  auth: UseAuthReturn;
  session: UseSessionReturn;
  signIn: UseSignInReturn;
}

const ClerkSafeContext = createContext<ClerkSafeContextValue | null>(null);

/**
 * Provider that supplies Clerk hook values via context.
 * Use this inside ClerkProvider to enable safe hooks.
 */
export function ClerkSafeValuesProvider({ children }: { children: ReactNode }) {
  const user = useUserOriginal();
  const auth = useAuthOriginal();
  const session = useSessionOriginal();
  const signIn = useSignInOriginal();

  const value = useMemo(
    () => ({ user, auth, session, signIn }),
    [user, auth, session, signIn]
  );

  return (
    <ClerkSafeContext.Provider value={value}>
      {children}
    </ClerkSafeContext.Provider>
  );
}

/**
 * Provider that supplies default Clerk values when Clerk is bypassed.
 */
export function ClerkSafeDefaultsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ClerkSafeContext.Provider
      value={{
        user: DEFAULT_USER_RETURN,
        auth: DEFAULT_AUTH_RETURN,
        session: DEFAULT_SESSION_RETURN,
        signIn: DEFAULT_SIGN_IN_RETURN,
      }}
    >
      {children}
    </ClerkSafeContext.Provider>
  );
}

/**
 * Safe version of useUser that returns defaults when Clerk is unavailable.
 * Use this instead of useUser from @clerk/nextjs to prevent errors when
 * Clerk is bypassed (e.g., during build, tests, or mock mode).
 *
 * Requires wrapping with either ClerkSafeValuesProvider (inside ClerkProvider)
 * or ClerkSafeDefaultsProvider (when Clerk is bypassed).
 *
 * @example
 * ```tsx
 * const { user, isLoaded, isSignedIn } = useUserSafe();
 * if (!isSignedIn) return <SignInPrompt />;
 * return <UserProfile user={user} />;
 * ```
 */
export function useUserSafe(): UseUserReturn {
  const context = useContext(ClerkSafeContext);
  if (!context) {
    // Fallback for components outside the provider tree
    return DEFAULT_USER_RETURN;
  }
  return context.user;
}

/**
 * Safe version of useAuth that returns defaults when Clerk is unavailable.
 * Use this instead of useAuth from @clerk/nextjs to prevent errors when
 * Clerk is bypassed.
 */
export function useAuthSafe(): UseAuthReturn {
  const context = useContext(ClerkSafeContext);
  if (!context) {
    return DEFAULT_AUTH_RETURN;
  }
  return context.auth;
}

/**
 * Safe version of useSession that returns defaults when Clerk is unavailable.
 * Use this instead of useSession from @clerk/nextjs to prevent errors when
 * Clerk is bypassed.
 */
export function useSessionSafe(): UseSessionReturn {
  const context = useContext(ClerkSafeContext);
  if (!context) {
    return DEFAULT_SESSION_RETURN;
  }
  return context.session;
}

/**
 * Safe version of useSignIn that returns defaults when Clerk is unavailable.
 * Use this instead of useSignIn from @clerk/nextjs to prevent provider errors
 * on routes rendered in mock/bypass mode.
 */
export function useSignInSafe(): UseSignInReturn {
  const context = useContext(ClerkSafeContext);
  if (!context) {
    return DEFAULT_SIGN_IN_RETURN;
  }
  return context.signIn;
}

// Re-export types for convenience
export type { UseAuthReturn, UseSessionReturn, UseSignInReturn, UseUserReturn };
