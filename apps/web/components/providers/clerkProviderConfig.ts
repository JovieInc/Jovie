'use client';

import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';

function getClerkProxyUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }

  return '/clerk';
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

export function shouldBypassClerkProvider(
  publishableKey: string | undefined
): boolean {
  return (
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    (publishableKey ? isMockPublishableKey(publishableKey) : false)
  );
}

export const clerkProviderProps = {
  proxyUrl: getClerkProxyUrl,
  appearance: {
    elements: {
      rootBox: 'bg-base text-primary-token',
      card: 'bg-surface-0 border border-subtle shadow-sm dark:shadow-lg dark:shadow-black/20',
      cardBox: 'bg-surface-0',
      headerTitle: 'text-primary-token font-semibold',
      headerSubtitle: 'text-secondary-token',
      formFieldLabel: 'text-primary-token font-medium',
      formFieldInput:
        'bg-surface-0 border border-subtle text-primary-token placeholder:text-tertiary-token focus-ring-themed rounded-lg transition-colors',
      formFieldInputShowPasswordButton:
        'text-secondary-token hover:text-primary-token',
      formFieldErrorText: 'text-destructive',
      formFieldSuccessText: 'text-green-600 dark:text-green-400',
      formButtonPrimary:
        'btn btn-primary btn-md rounded-xl shadow-sm hover:opacity-90 transition-all',
      formButtonReset: 'text-secondary-token hover:text-primary-token',
      socialButtonsBlockButton:
        'btn btn-secondary btn-md border border-subtle hover:bg-surface-1 transition-colors',
      socialButtonsBlockButtonText: 'text-primary-token',
      socialButtonsProviderIcon: 'w-5 h-5',
      dividerLine: 'bg-subtle',
      dividerText: 'text-tertiary-token',
      footer: 'bg-transparent',
      footerActionText: 'text-secondary-token',
      footerActionLink: 'text-accent-token hover:underline',
      alert: 'bg-surface-1 border border-subtle text-primary-token',
      alertText: 'text-primary-token',
      badge: 'bg-surface-2 text-secondary-token',
      avatarBox: 'border-2 border-subtle',
      identityPreview: 'bg-surface-1 border border-subtle',
      identityPreviewText: 'text-primary-token',
      identityPreviewEditButton:
        'text-secondary-token hover:text-primary-token',
      otpCodeFieldInput:
        'bg-surface-0 border border-subtle text-primary-token focus-visible:border-default focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]/30',
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
  },
  signInUrl: APP_ROUTES.SIGNIN,
  signUpUrl: APP_ROUTES.SIGNUP,
  signInFallbackRedirectUrl: APP_ROUTES.DASHBOARD,
  signUpFallbackRedirectUrl: APP_ROUTES.ONBOARDING,
} as const;
