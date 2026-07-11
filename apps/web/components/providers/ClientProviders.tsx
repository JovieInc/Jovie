'use client';

import { TooltipProvider } from '@jovie/ui';
import React from 'react';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';
import { useDesktopAppBootSignal } from '@/lib/desktop/electron-bridge';
import type { ThemeMode } from '@/types';
import { CoreProviders } from './CoreProviders';
import { QueryProvider } from './QueryProvider';

/** Cancels the Electron shell boot watchdog after React mounts (JOV-3595). */
function DesktopAppBootSignal() {
  useDesktopAppBootSignal();
  return null;
}

interface ClientProvidersProps {
  readonly children: React.ReactNode;
  readonly authBootstrap?: ClientAuthBootstrap | null;
  readonly forceBypassClerk?: boolean;
  readonly initialThemeMode?: ThemeMode;
  readonly publishableKey?: string | undefined;
  readonly skipCoreProviders?: boolean;
}

// Inner component that wraps children with CoreProviders or QueryProvider
interface WrappedProvidersOptions {
  children: React.ReactNode;
  initialThemeMode: ThemeMode;
  skipCoreProviders: boolean;
}

function wrapWithCoreProviders({
  children,
  initialThemeMode,
  skipCoreProviders,
}: WrappedProvidersOptions) {
  const content = skipCoreProviders ? (
    <QueryProvider>
      <TooltipProvider delayDuration={1200}>{children}</TooltipProvider>
    </QueryProvider>
  ) : (
    <CoreProviders initialThemeMode={initialThemeMode}>
      {children}
    </CoreProviders>
  );

  return content;
}

/**
 * Client providers root (Clerk → Better Auth migration, client-flip commit ⑦).
 *
 * Better Auth needs no provider — `authClient.useSession()` reads the session
 * cookie directly. The context fan-out architecture from the Clerk era is
 * preserved (plan decision 7): `JovieAuthValuesProvider` (aliased here as
 * `ClerkSafeValuesProvider`) subscribes to the session ONCE and fans the
 * user/auth/session slices out through context so the 36
 * `useUserSafe`/`useAuthSafe`/`useSessionSafe` consumers don't churn.
 *
 * The legacy `publishableKey` / `forceBypassClerk` / `authBootstrap` props are
 * kept in the interface for source compatibility with existing callers
 * (`ResolvedClientProviders`) but are functionally inert under Better Auth:
 *   - `publishableKey` — no Clerk JS to load.
 *   - `forceBypassClerk` — routes to `ClerkSafeDefaultsProvider` (signed-out
 *     safe defaults) for mock/DB-less mode.
 *   - `authBootstrap` — under Clerk this synthesized a fake user because
 *     Clerk's client SDK couldn't see the dev test cookie. Under BA the dev
 *     bypass mints a REAL `ba_sessions` row + session cookie (commit ⑤'s
 *     `mintBetterAuthSessionForDevTestActor`), so `authClient.useSession()`
 *     observes it through the standard cookie path and the bootstrap provider
 *     collapses into the live values provider.
 */
export function ClientProviders({
  children,
  authBootstrap = null,
  forceBypassClerk = false,
  initialThemeMode = 'dark',
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const wrappedChildren = wrapWithCoreProviders({
    children,
    initialThemeMode,
    skipCoreProviders,
  });

  // `forceBypassClerk` routes to signed-out safe defaults (mock/DB-less mode,
  // build-time rendering, tests). Under BA this is the only remaining branch
  // — the bootstrap branch collapsed because the dev bypass now mints a real
  // BA session cookie that `authClient.useSession()` observes directly.
  if (forceBypassClerk && !authBootstrap?.isAuthenticated) {
    return (
      <ClerkSafeDefaultsProvider>
        <DesktopAppBootSignal />
        {wrappedChildren}
      </ClerkSafeDefaultsProvider>
    );
  }

  return (
    <ClerkSafeValuesProvider>
      <DesktopAppBootSignal />
      {wrappedChildren}
    </ClerkSafeValuesProvider>
  );
}
