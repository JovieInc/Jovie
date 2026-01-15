'use client';

import { ClerkProvider, useUser } from '@clerk/nextjs';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect } from 'react';
import { logger } from '@/lib/utils/logger';
import type { ThemeMode } from '@/types';
import type { LazyProvidersProps } from './LazyProviders';
import { NuqsProvider } from './NuqsProvider';
import { QueryProvider } from './QueryProvider';
import type { StatsigProvidersProps } from './StatsigProviders';

type LazyProvidersLoadingProps = LazyProvidersProps &
  DynamicOptionsLoadingProps;

function LazyProvidersSkeleton(props: DynamicOptionsLoadingProps) {
  const { children } = props as LazyProvidersLoadingProps;
  return <>{children}</>;
}

function ThemeKeyboardShortcut() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 't') return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        const isTextInput =
          tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        if (isTextInput || target.isContentEditable) return;
      }

      event.preventDefault();
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [resolvedTheme, setTheme]);

  return null;
}

// Lazy load non-critical providers to reduce initial bundle size
const LazyProviders = dynamic<LazyProvidersProps>(
  () => import('./LazyProviders').then(mod => ({ default: mod.LazyProviders })),
  {
    ssr: false,
    loading: LazyProvidersSkeleton,
  }
);

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
}

interface ClientProvidersInnerBaseProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
  enableStatsig?: boolean;
  userId?: string;
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

function ClientProvidersInnerBase({
  children,
  initialThemeMode = 'system',
  enableStatsig = true,
  userId,
}: ClientProvidersInnerBaseProps) {
  useEffect(() => {
    // Environment-gated startup log
    try {
      logger.group('Jovie App');
      logger.info('Booting client providers', {
        vercelEnv: process.env.VERCEL_ENV || 'local',
        nodeEnv: process.env.NODE_ENV,
      });
      // Feature flags removed - pre-launch
      logger.groupEnd();

      // Initialize Web Vitals tracking for performance monitoring
      let cleanupWebVitals: (() => void) | undefined;
      let isUnmounted = false;
      import('@/lib/monitoring/web-vitals').then(({ initWebVitals }) => {
        const cleanup = initWebVitals(metric => {
          // Create a custom event for the performance dashboard
          if (typeof window !== 'undefined') {
            const event = new CustomEvent('web-vitals', { detail: metric });
            window.dispatchEvent(event);
          }
        });

        if (isUnmounted) {
          cleanup();
          return;
        }

        cleanupWebVitals = cleanup;
      });

      // Initialize other performance monitoring in production
      if (process.env.NODE_ENV === 'production') {
        import('@/lib/monitoring/client').then(({ initAllMonitoring }) => {
          initAllMonitoring();
        });
      }

      return () => {
        isUnmounted = true;
        if (cleanupWebVitals) {
          cleanupWebVitals();
        }
      };
    } catch (error) {
      console.error('Error initializing monitoring:', error);
      return undefined;
    }
  }, []);

  return (
    <React.StrictMode>
      <NuqsProvider>
        <QueryProvider>
          <ThemeProvider
            attribute='class'
            defaultTheme={initialThemeMode}
            enableSystem={true}
            disableTransitionOnChange
            storageKey='jovie-theme'
          >
            <ThemeKeyboardShortcut />
            {enableStatsig ? (
              <StatsigProviders userId={userId}>
                <LazyProviders enableAnalytics={enableStatsig}>
                  {children}
                </LazyProviders>
              </StatsigProviders>
            ) : (
              <LazyProviders enableAnalytics={false}>{children}</LazyProviders>
            )}
          </ThemeProvider>
        </QueryProvider>
      </NuqsProvider>
    </React.StrictMode>
  );
}

// Inner component that uses Clerk hooks (must be inside ClerkProvider)
interface ClientProvidersInnerProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
  enableStatsig?: boolean;
}

function ClientProvidersInner({
  children,
  initialThemeMode = 'system',
  enableStatsig = true,
}: ClientProvidersInnerProps) {
  const { user } = useUser();

  return (
    <ClientProvidersInnerBase
      userId={user?.id}
      initialThemeMode={initialThemeMode}
      enableStatsig={enableStatsig}
    >
      {children}
    </ClientProvidersInnerBase>
  );
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
      'bg-surface-0 border border-subtle text-primary-token focus:border-default focus:ring-2 focus:ring-[rgb(var(--focus-ring))]/30',

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

// Get the Clerk proxy URL for custom domain setup (e.g., clerk.jov.ie)
const clerkProxyUrl = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API;

// Main export - wraps children with ClerkProvider (client-side only)
// Uses hydration guard to prevent SSR of ClerkProvider which accesses window
export function ClientProviders({
  children,
  initialThemeMode = 'system',
  publishableKey,
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
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (shouldBypassClerk) {
    return (
      <ClientProvidersInnerBase
        initialThemeMode={initialThemeMode}
        enableStatsig={enableStatsig}
      >
        {children}
      </ClientProvidersInnerBase>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey!}
      appearance={clerkAppearance}
      proxyUrl={clerkProxyUrl}
    >
      <ClientProvidersInner
        initialThemeMode={initialThemeMode}
        enableStatsig={enableStatsig}
      >
        {children}
      </ClientProvidersInner>
    </ClerkProvider>
  );
}
