import './auth-utilities.css';
import * as Sentry from '@sentry/nextjs';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import {
  getRequestLocationFromHeaders,
  isMockPublishableKey,
  isPublicAuthHost,
} from '@/components/providers/clerkAvailability';
import {
  AuthLayout as AuthShellLayout,
  AuthUnavailableCard,
} from '@/features/auth';
import { CLERK_KEY_STATUS_HEADER } from '@/lib/auth/clerk-key-status';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

// Auth routes must never be indexed — duplicate signup/signin pages hurt SEO
// and the flows carry state that search crawlers shouldn't surface.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialFlags = await getAppFlagsSnapshot();
  const publishableKey = await resolvePublishableKeyFromHeaders();
  const hdrs = await headers();
  const isClerkUnavailable =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (isClerkUnavailable) {
    const location = getRequestLocationFromHeaders(hdrs);
    const onPublicHost = isPublicAuthHost(location);
    if (onPublicHost) {
      const keyStatus = hdrs.get(CLERK_KEY_STATUS_HEADER);
      Sentry.captureMessage('clerk_bypass_on_public_host', {
        level: 'error',
        tags: {
          hostname: location?.hostname ?? 'unknown',
          key_status: keyStatus ?? 'unknown',
        },
      });
    }
    return (
      <AppFlagProvider initialFlags={initialFlags}>
        <main id='main-content'>
          <AuthShellLayout
            formTitle='Auth unavailable'
            showFormTitle={false}
            showFooterPrompt={false}
            layoutVariant='split'
          >
            <AuthUnavailableCard showResetAction={onPublicHost} />
          </AuthShellLayout>
        </main>
      </AppFlagProvider>
    );
  }

  return (
    <AuthClientProviders forceEnableClerk publishableKey={publishableKey}>
      <AppFlagProvider initialFlags={initialFlags}>
        <main id='main-content'>{children}</main>
      </AppFlagProvider>
    </AuthClientProviders>
  );
}
