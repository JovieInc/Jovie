'use client';

// @coverage-via apps/web/tests/components/providers/ClientProviders.interaction.test.tsx
import { TooltipProvider } from '@jovie/ui';
import React from 'react';
import {
  JovieAuthDefaultsProvider,
  JovieAuthValuesProvider,
} from '@/hooks/useJovieAuth';
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
  readonly forceSignedOutDefaults?: boolean;
  readonly initialThemeMode?: ThemeMode;
  readonly skipCoreProviders?: boolean;
}

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
 * Client providers root. Better Auth needs no vendor provider —
 * `authClient.useSession()` reads the session cookie. The context fan-out
 * from `useJovieAuth` still mounts once so `useUserSafe` / `useAuthSafe` /
 * `useSessionSafe` consumers keep working.
 *
 * `forceSignedOutDefaults` is for mock/DB-less/public-profile rendering
 * that must not subscribe to a live session.
 */
export function ClientProviders({
  children,
  authBootstrap = null,
  forceSignedOutDefaults = false,
  initialThemeMode = 'dark',
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const wrappedChildren = wrapWithCoreProviders({
    children,
    initialThemeMode,
    skipCoreProviders,
  });

  if (forceSignedOutDefaults && !authBootstrap?.isAuthenticated) {
    return (
      <JovieAuthDefaultsProvider>
        <DesktopAppBootSignal />
        {wrappedChildren}
      </JovieAuthDefaultsProvider>
    );
  }

  return (
    <JovieAuthValuesProvider>
      <DesktopAppBootSignal />
      {wrappedChildren}
    </JovieAuthValuesProvider>
  );
}
