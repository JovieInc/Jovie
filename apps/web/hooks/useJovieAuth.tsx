'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { authClient } from '@/lib/auth/client';
import { type JovieUser, toJovieUser } from '@/lib/auth/jovie-user';

// ============================================================================
// Jovie auth context fan-out (Better Auth port of hooks/useClerkSafe.tsx)
// ============================================================================
// INERT until the client-flip commit of the Better Auth migration
// (docs/auth/better-auth-migration-plan.md, build-order commit ⑦). At flip
// time `useClerkSafe.tsx` becomes a re-export shim over this module.
//
// ARCHITECTURE (unchanged from useClerkSafe): exactly ONE subscription to the
// auth source lives in the values provider; every consumer reads a derived
// slice through context. Components that can render with or without a live
// auth provider keep working — outside any provider the hooks return
// signed-out safe defaults.
//
// BOOTSTRAP DECISION: useClerkSafe had a third provider
// (ClerkSafeBootstrapProvider) that synthesized a fake Clerk user from
// `/api/dev/test-auth` bootstrap data, because the dev bypass minted
// app-side cookies Clerk's client SDK could not see. Under Better Auth the
// bypass mints REAL `ba_sessions` rows + session cookies (plan commit ⑨,
// "Local dev auth in 60 seconds" acceptance criterion), so
// `authClient.useSession()` observes bypass sessions through the standard
// cookie path and the bootstrap provider collapses into the live values
// provider. Constraint this rests on: `/api/dev/test-auth/*` must keep
// minting real Better Auth sessions — if that ever regresses to synthetic
// client-only auth, a bootstrap provider must be reintroduced here.
// ============================================================================

interface JovieSignOutOptions {
  /** Hard-navigation target after sign-out. Defaults to `/signin`. */
  readonly redirectUrl?: string;
}

/**
 * The slice of the Better Auth session consumers actually read.
 * Evidence: `activeSession?.id` (AccountSettingsSection.tsx →
 * SessionManagementCard current-session highlight) is the only field any
 * `useSessionSafe()` consumer touches.
 */
export interface JovieSession {
  readonly id: string;
  readonly userId: string;
}

export interface UseUserSafeReturn {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly user: JovieUser | null;
}

export interface UseAuthSafeReturn {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly getToken: () => Promise<string | null>;
  readonly signOut: (options?: JovieSignOutOptions) => Promise<void>;
}

export interface UseSessionSafeReturn {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly session: JovieSession | null;
}

/**
 * Sign out of the live Better Auth session, then hard-navigate.
 *
 * Hard navigation (location.assign, not router.push) intentionally drops all
 * client state after the session ends. Revocation failures are swallowed:
 * we navigate regardless, and if the session cookie survived a failed
 * revocation the destination's auth gate bounces the still-signed-in user
 * back, so the failure is visible rather than silent.
 */
export async function signOut(options?: JovieSignOutOptions): Promise<void> {
  await authClient.signOut().catch(() => undefined);

  const redirectUrl = options?.redirectUrl ?? '/signin';
  if (typeof globalThis.location?.assign === 'function') {
    globalThis.location.assign(redirectUrl);
  }
}

/**
 * Cookie-backed Better Auth sessions ride same-origin fetches automatically,
 * and a grep of `getToken` shows ZERO client-side consumers (the only web
 * hits are a local helper named `getTokenIfModified` in
 * SettingsAdPixelsSection.tsx and server/native/e2e code), so no client
 * token is ever needed. Kept in the signature for Clerk `useAuth()`
 * compatibility; always resolves `null`. A future consumer that genuinely
 * needs a token (e.g. non-cookie transport) must use the server-side bearer
 * plugin path instead of this hook.
 */
const getToken = async (): Promise<string | null> => null;

const noopSignOut = async (_options?: JovieSignOutOptions): Promise<void> => {
  // Mock/DB-less mode has no server session to revoke.
};

const DEFAULT_USER_RETURN: UseUserSafeReturn = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
};

const DEFAULT_AUTH_RETURN: UseAuthSafeReturn = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  getToken,
  signOut: noopSignOut,
};

const DEFAULT_SESSION_RETURN: UseSessionSafeReturn = {
  isLoaded: true,
  isSignedIn: false,
  session: null,
};

interface JovieAuthContextValue {
  readonly user: UseUserSafeReturn;
  readonly auth: UseAuthSafeReturn;
  readonly session: UseSessionSafeReturn;
  readonly canRenderAuthUi: boolean;
}

const JovieAuthContext = createContext<JovieAuthContextValue | null>(null);

/**
 * Live provider: subscribes to the Better Auth session ONCE and fans the
 * derived user/auth/session slices out via context. Mounts wherever
 * ClerkProvider + ClerkSafeValuesProvider mount today (client-flip commit).
 */
export function JovieAuthValuesProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { data, isPending } = authClient.useSession();

  const value = useMemo<JovieAuthContextValue>(() => {
    // Clerk's isLoaded meant "Clerk JS finished booting"; the Better Auth
    // equivalent is "the initial session fetch settled". Refetches keep
    // isLoaded true (isRefetching is deliberately ignored) so consumers
    // never flash loading states on revalidation.
    const isLoaded = !isPending;
    const user = data?.user ? toJovieUser(data.user) : null;
    const isSignedIn = user !== null;

    return {
      user: { isLoaded, isSignedIn, user },
      auth: {
        isLoaded,
        isSignedIn,
        userId: user?.id ?? null,
        sessionId: data?.session.id ?? null,
        getToken,
        signOut,
      },
      session: {
        isLoaded,
        isSignedIn,
        session: data?.session
          ? { id: data.session.id, userId: data.session.userId }
          : null,
      },
      canRenderAuthUi: true,
    };
  }, [data, isPending]);

  return (
    <JovieAuthContext.Provider value={value}>
      {children}
    </JovieAuthContext.Provider>
  );
}

/**
 * Safe-defaults provider for mock/DB-less mode: build-time rendering, tests,
 * and bypassed-auth origins per the `shouldBypassClerk()` contract in
 * components/providers/clerkAvailability.ts (keyed off NEXT_PUBLIC_CLERK_MOCK
 * today; the NEXT_PUBLIC_AUTH_MOCK rename lands with the migration's env
 * commit). Everything renders signed-out and auth UI stays hidden.
 */
export function JovieAuthDefaultsProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <JovieAuthContext.Provider
      value={{
        user: DEFAULT_USER_RETURN,
        auth: DEFAULT_AUTH_RETURN,
        session: DEFAULT_SESSION_RETURN,
        canRenderAuthUi: false,
      }}
    >
      {children}
    </JovieAuthContext.Provider>
  );
}

/**
 * Signature-compatible replacement for useClerkSafe's `useUserSafe()`.
 * Returns signed-out defaults outside any provider.
 */
export function useUserSafe(): UseUserSafeReturn {
  const context = useContext(JovieAuthContext);
  if (!context) {
    return DEFAULT_USER_RETURN;
  }
  return context.user;
}

/**
 * Signature-compatible replacement for useClerkSafe's `useAuthSafe()`.
 * Returns signed-out defaults outside any provider.
 */
export function useAuthSafe(): UseAuthSafeReturn {
  const context = useContext(JovieAuthContext);
  if (!context) {
    return DEFAULT_AUTH_RETURN;
  }
  return context.auth;
}

/**
 * Signature-compatible replacement for useClerkSafe's `useSessionSafe()`.
 * Returns signed-out defaults outside any provider.
 */
export function useSessionSafe(): UseSessionSafeReturn {
  const context = useContext(JovieAuthContext);
  if (!context) {
    return DEFAULT_SESSION_RETURN;
  }
  return context.session;
}

/**
 * Whether live auth UI (sign-in forms, One Tap, user button menus that hit
 * the network) may render. Mirrors useClerkSafe's `useCanRenderClerkUi`.
 */
export function useCanRenderAuthUi(): boolean {
  const context = useContext(JovieAuthContext);
  return context?.canRenderAuthUi ?? false;
}

// Jovie-named aliases (migration plan hooks decision): identical bindings,
// so `useJovieAuth === useAuthSafe` etc. New code should prefer these names.
export const useJovieAuth = useAuthSafe;
export const useJovieUser = useUserSafe;
export const useJovieSession = useSessionSafe;

export type { JovieUser } from '@/lib/auth/jovie-user';
export type { JovieSignOutOptions };
