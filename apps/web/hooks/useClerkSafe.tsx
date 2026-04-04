'use client';

import {
  useAuth as useAuthOriginal,
  useSession as useSessionOriginal,
  useUser as useUserOriginal,
} from '@clerk/nextjs';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';

// Derive types from the actual hook return types
type UseUserReturn = ReturnType<typeof useUserOriginal>;
type UseAuthReturn = ReturnType<typeof useAuthOriginal>;
type UseSessionReturn = ReturnType<typeof useSessionOriginal>;

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

function splitFullName(fullName: string) {
  const [firstName = fullName, ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' ').trim() || null,
  };
}

function createMockClerkActionError(action: string) {
  return new Error(`${action} is unavailable in local test auth mode.`);
}

function createMockEmailAddress(id: string, emailAddress: string) {
  return {
    id,
    emailAddress,
    verification: {
      status: 'verified',
    },
    prepareVerification: async () => {
      throw createMockClerkActionError('Email verification');
    },
    attemptVerification: async () => {
      throw createMockClerkActionError('Email verification');
    },
    destroy: async () => {
      throw createMockClerkActionError('Email removal');
    },
  };
}

function createBootstrapUserReturn(
  bootstrap: ClientAuthBootstrap
): UseUserReturn {
  const { firstName, lastName } = splitFullName(bootstrap.fullName);
  const primaryEmailAddressId = `email_dev_test_${bootstrap.persona}`;
  const primaryEmailAddress = createMockEmailAddress(
    primaryEmailAddressId,
    bootstrap.email
  );

  const user = {
    id: bootstrap.userId,
    username: bootstrap.username,
    firstName,
    lastName,
    fullName: bootstrap.fullName,
    imageUrl: '/avatars/default-user.png',
    primaryEmailAddressId,
    primaryEmailAddress,
    emailAddresses: [primaryEmailAddress],
    externalAccounts: [],
    getSessions: async () => [],
    createEmailAddress: async () => {
      throw createMockClerkActionError('Email management');
    },
    update: async () => {
      throw createMockClerkActionError('Account updates');
    },
    reload: async () => {},
    privateMetadata: {
      isAdmin: bootstrap.isAdmin,
      devTestAuthPersona: bootstrap.persona,
    },
  } as unknown as NonNullable<UseUserReturn['user']>;

  return {
    isLoaded: true,
    isSignedIn: true,
    user,
  } as UseUserReturn;
}

function createBootstrapSessionReturn(
  bootstrap: ClientAuthBootstrap
): UseSessionReturn {
  const session = {
    id: `sess_dev_test_${bootstrap.persona}`,
    user: {
      id: bootstrap.userId,
    },
  } as unknown as NonNullable<UseSessionReturn['session']>;

  return {
    isLoaded: true,
    isSignedIn: true,
    session,
  } as UseSessionReturn;
}

function getRedirectUrlFromSignOutOptions(options: unknown): string | null {
  if (!options || typeof options !== 'object') {
    return null;
  }

  if ('redirectUrl' in options && typeof options.redirectUrl === 'string') {
    return options.redirectUrl;
  }

  return null;
}

function createBootstrapAuthReturn(
  bootstrap: ClientAuthBootstrap
): UseAuthReturn {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: bootstrap.userId,
    sessionId: `sess_dev_test_${bootstrap.persona}`,
    sessionClaims: {} as UseAuthReturn['sessionClaims'],
    actor: null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    has: () => false,
    signOut: async (options?: unknown) => {
      const response = await fetch('/api/dev/test-auth/session', {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => null);

      if (!response?.ok) {
        await fetch('/api/dev/clear-session', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);
      }

      const redirectUrl = getRedirectUrlFromSignOutOptions(options);

      if (redirectUrl && typeof globalThis.location?.assign === 'function') {
        globalThis.location.assign(redirectUrl);
        return;
      }

      if (typeof globalThis.location?.reload === 'function') {
        globalThis.location.reload();
      }
    },
    getToken: async () => null,
  } as unknown as UseAuthReturn;
}

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
  const value = useMemo(() => ({ user, auth, session }), [user, auth, session]);

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
      }}
    >
      {children}
    </ClerkSafeContext.Provider>
  );
}

export function ClerkSafeBootstrapProvider({
  bootstrap,
  children,
}: {
  readonly bootstrap: ClientAuthBootstrap;
  readonly children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      user: createBootstrapUserReturn(bootstrap),
      auth: createBootstrapAuthReturn(bootstrap),
      session: createBootstrapSessionReturn(bootstrap),
    }),
    [bootstrap]
  );

  return (
    <ClerkSafeContext.Provider value={value}>
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

// Re-export types for convenience
export type { UseAuthReturn, UseSessionReturn, UseUserReturn };
