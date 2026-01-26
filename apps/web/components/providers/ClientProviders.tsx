'use client';

import { ClerkProvider, useUser } from '@clerk/nextjs';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import React from 'react';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import type { ThemeMode } from '@/types';
import { CoreProviders } from './CoreProviders';
import type { StatsigProvidersProps } from './StatsigProviders';

type StatsigLoadingProps = StatsigProvidersProps & DynamicOptionsLoadingProps;

function StatsigProvidersSkeleton(props: DynamicOptionsLoadingProps) {
  const { children } = props as StatsigLoadingProps;
  return <>{children}</>;
}

const StatsigProviders = dynamic<StatsigProvidersProps>(
  () =>
    import('./StatsigProviders').then(mod => ({
      default: mod.StatsigProviders,
    })),
  {
    loading: StatsigProvidersSkeleton,
  }
);

interface ClientProvidersProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
  publishableKey: string | undefined;
  skipCoreProviders?: boolean;
}

function isMockPublishableKey(publishableKey: string): boolean {
  const lower = publishableKey.toLowerCase();
  return (
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('placeholder') ||
    lower.includes('test-key')
  );
}

// Inner component that uses Clerk hooks (must be inside ClerkProvider)
interface ClientProvidersInnerProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
  enableStatsig?: boolean;
  skipCoreProviders?: boolean;
}

interface WrappedProvidersOptions {
  children: React.ReactNode;
  initialThemeMode: ThemeMode;
  enableStatsig: boolean;
  userId?: string;
  skipCoreProviders: boolean;
}

function wrapWithStatsig({
  children,
  initialThemeMode,
  enableStatsig,
  userId,
  skipCoreProviders,
}: WrappedProvidersOptions) {
  const content = skipCoreProviders ? (
    children
  ) : (
    <CoreProviders initialThemeMode={initialThemeMode}>
      {children}
    </CoreProviders>
  );

  if (!enableStatsig) {
    return content;
  }

  return <StatsigProviders userId={userId}>{content}</StatsigProviders>;
}

function ClientProvidersInner({
  children,
  initialThemeMode = 'system',
  enableStatsig = true,
  skipCoreProviders = false,
}: ClientProvidersInnerProps) {
  const { user } = useUser();

  return wrapWithStatsig({
    children,
    initialThemeMode,
    enableStatsig,
    userId: user?.id,
    skipCoreProviders,
  });
}

// Clerk appearance config with comprehensive dark mode support
const clerkAppearance = {
  elements: {
    // Root and layout
    rootBox: 'bg-base text-primary-token',
    card: 'bg-surface-0 border border-subtle shadow-sm dark:shadow-lg dark:shadow-black/20',
    cardBox: 'bg-surface-0',

    // Headers
    headerTitle: 'text-primary-token font-semibold',
    headerSubtitle: 'text-secondary-token',

    // Form elements
    formFieldLabel: 'text-primary-token font-medium',
    formFieldInput:
      'bg-surface-0 border border-subtle text-primary-token placeholder:text-tertiary-token focus-ring-themed rounded-lg transition-colors',
    formFieldInputShowPasswordButton:
      'text-secondary-token hover:text-primary-token',
    formFieldErrorText: 'text-destructive',
    formFieldSuccessText: 'text-green-600 dark:text-green-400',

    // Buttons
    formButtonPrimary:
      'btn btn-primary btn-md rounded-xl shadow-sm hover:opacity-90 transition-all',
    formButtonReset: 'text-secondary-token hover:text-primary-token',
    socialButtonsBlockButton:
      'btn btn-secondary btn-md border border-subtle hover:bg-surface-1 transition-colors',
    socialButtonsBlockButtonText: 'text-primary-token',
    socialButtonsProviderIcon: 'w-5 h-5',

    // Dividers
    dividerLine: 'bg-subtle',
    dividerText: 'text-tertiary-token',

    // Footer
    footer: 'bg-transparent',
    footerActionText: 'text-secondary-token',
    footerActionLink: 'text-accent-token hover:underline',

    // Alerts and badges
    alert: 'bg-surface-1 border border-subtle text-primary-token',
    alertText: 'text-primary-token',
    badge: 'bg-surface-2 text-secondary-token',

    // Avatars and identifiers
    avatarBox: 'border-2 border-subtle',
    identityPreview: 'bg-surface-1 border border-subtle',
    identityPreviewText: 'text-primary-token',
    identityPreviewEditButton: 'text-secondary-token hover:text-primary-token',

    // OTP input
    otpCodeFieldInput:
      'bg-surface-0 border border-subtle text-primary-token focus-visible:border-default focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]/30',

    // Modal overlays
    modalBackdrop: 'bg-black/50 dark:bg-black/70 backdrop-blur-sm',
    modalContent: 'bg-surface-0 border border-subtle shadow-xl',
  },
  variables: {
    colorPrimary: 'var(--color-accent)',
    colorText: 'var(--color-text-primary-token)',
    colorTextSecondary: 'var(--color-text-secondary-token)',
    colorBackground: 'var(--color-bg-surface-0)',
    colorInputBackground: 'var(--color-bg-surface-0)',
    colorInputText: 'var(--color-text-primary-token)',
    borderRadius: '0.75rem',
  },
};

// Custom domain is configured via CNAME (clerk.jov.ie → frontend-api.clerk.services)
// No proxyUrl needed - Clerk SDK uses the domain from publishable key configuration

// Main export - wraps children with ClerkProvider (client-side only)
// Uses hydration guard to prevent SSR of ClerkProvider which accesses window
export function ClientProviders({
  children,
  initialThemeMode = 'system',
  publishableKey,
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const pathname = usePathname();
  const marketingPrefixes = [
    '/blog',
    '/changelog',
    '/engagement-engine',
    '/investors',
    '/link-in-bio',
    '/pricing',
    '/support',
    '/waitlist',
  ];
  const isMarketingRoute =
    pathname === '/' ||
    marketingPrefixes.some(prefix => pathname.startsWith(prefix));
  const enableStatsig = !isMarketingRoute;

  const shouldBypassClerk =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (shouldBypassClerk) {
    // When Clerk is bypassed, wrap with ClerkSafeDefaultsProvider
    // so that safe hooks (useUserSafe, useAuthSafe, etc.) return defaults
    // instead of throwing "must be used within ClerkProvider" errors
    return (
      <ClerkSafeDefaultsProvider>
        {wrapWithStatsig({
          children,
          initialThemeMode,
          enableStatsig,
          skipCoreProviders,
        })}
      </ClerkSafeDefaultsProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      appearance={clerkAppearance}
    >
      <ClerkSafeValuesProvider>
        <ClientProvidersInner
          initialThemeMode={initialThemeMode}
          enableStatsig={enableStatsig}
          skipCoreProviders={skipCoreProviders}
        >
          {children}
        </ClientProvidersInner>
      </ClerkSafeValuesProvider>
    </ClerkProvider>
  );
}
