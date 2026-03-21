'use client';

import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect, useMemo } from 'react';
import { isFormElement } from '@/lib/utils/keyboard';
import type { ThemeMode } from '@/types';

function ThemeKeyboardShortcut({ isEnabled }: { isEnabled: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!isEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!event.key || event.key.toLowerCase() !== 't') return;
      if (isFormElement(event.target)) return;

      event.preventDefault();
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [resolvedTheme, setTheme, isEnabled]);

  return null;
}

interface NonAuthCoreProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode: ThemeMode;
  readonly pathname: string;
  readonly themeEnabled: boolean;
  readonly isPublicVariant: boolean;
}

type NonAuthCoreProvidersLoadingProps = NonAuthCoreProvidersProps &
  DynamicOptionsLoadingProps;

function NonAuthCoreProvidersSkeleton(props: DynamicOptionsLoadingProps) {
  const { children } = props as NonAuthCoreProvidersLoadingProps;
  return <>{children}</>;
}

const NonAuthCoreProviders = dynamic<NonAuthCoreProvidersProps>(
  () =>
    import('./NonAuthCoreProviders').then(mod => ({
      default: mod.NonAuthCoreProviders,
    })),
  {
    ssr: true,
    loading: NonAuthCoreProvidersSkeleton,
  }
);

export interface CoreProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
}

const AUTH_PROVIDER_PREFIXES = ['/signin', '/signup'] as const;

const FULL_PROVIDER_PREFIXES = [
  '/app',
  '/account',
  '/artist-selection',
  '/billing',
  '/sso-callback',
  '/onboarding',
] as const;

const THEME_ENABLED_PREFIXES = [
  '/app',
  '/onboarding',
  '/signin',
  '/signup',
  '/waitlist',
] as const;

type CoreProviderVariant = 'auth' | 'full' | 'public';

export function getCoreProviderVariant(pathname: string): CoreProviderVariant {
  if (AUTH_PROVIDER_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return 'auth';
  }

  return FULL_PROVIDER_PREFIXES.some(prefix => pathname.startsWith(prefix))
    ? 'full'
    : 'public';
}

export function isThemeEnabledRoute(pathname: string): boolean {
  return THEME_ENABLED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function CoreProviders({
  children,
  initialThemeMode = 'dark',
}: CoreProvidersProps) {
  const pathname = usePathname() ?? '';
  const variant = useMemo(() => getCoreProviderVariant(pathname), [pathname]);
  const themeEnabled = useMemo(() => isThemeEnabledRoute(pathname), [pathname]);
  const isAuthVariant = variant === 'auth';
  const isPublicVariant = variant === 'public';

  if (isAuthVariant) {
    return (
      <ThemeProvider
        attribute='class'
        defaultTheme={initialThemeMode}
        enableSystem
        disableTransitionOnChange
        storageKey='jovie-theme'
      >
        <ThemeKeyboardShortcut isEnabled={themeEnabled} />
        {children}
      </ThemeProvider>
    );
  }

  return (
    <NonAuthCoreProviders
      initialThemeMode={initialThemeMode}
      pathname={pathname}
      themeEnabled={themeEnabled}
      isPublicVariant={isPublicVariant}
    >
      {children}
    </NonAuthCoreProviders>
  );
}
