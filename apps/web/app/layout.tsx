import * as Sentry from '@sentry/nextjs';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import React from 'react';
import { CoreProviders } from '@/components/providers/CoreProviders';
import { APP_NAME, APP_URL } from '@/constants/app';
// Feature flags removed - pre-launch
// import { runStartupEnvironmentValidation } from '@/lib/startup/environment-validator'; // Moved to build-time for performance
import './globals.css';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

// Configure Inter Variable font from local file (no external network requests)
const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Jovie is the smartest link in bio for music artists. Connect your music, social media, and merch in one place. No design needed.',
  keywords: [
    'Jovie',
    'link in bio for musicians',
    'artist profile',
    'music artist',
    'smart links',
    'spotify',
    'social media',
    'music promotion',
    'creator profile',
    'music marketing',
    'streaming',
    'music links',
    'artist bio',
    'music discovery',
    'fan engagement',
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    title: APP_NAME,
    description:
      'Jovie is the smartest link in bio for music artists. Connect your music, social media, and merch in one place. No design needed.',
    siteName: APP_NAME,
    images: [
      {
        url: `${APP_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description:
      'Jovie is the smartest link in bio for music artists. Connect your music, social media, and merch in one place. No design needed.',
    images: [`${APP_URL}/og/default.png`],
    creator: '@jovieapp',
    site: '@jovieapp',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: publicEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'application-name': APP_NAME,
    'msapplication-TileColor': '#6366f1',
    'msapplication-TileImage': '/android-chrome-192x192.png',
    'msapplication-config': 'none',
    'theme-color': '#0a0a0a',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/favicon.svg',
        color: '#6366f1',
      },
    ],
  },
  // manifest.ts in app/ auto-generates the manifest link
};

// Viewport configuration with viewport-fit=cover for iOS safe area insets
export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isE2EClientRuntime = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  // Dev toolbar: shown in dev/preview, or in production when __dev_toolbar cookie is set.
  // Dynamic import means zero bundle cost for production users without the cookie.
  const { cookies } = await import('next/headers');
  const devCookieSet = (await cookies()).get('__dev_toolbar')?.value === '1';
  const isProductionEnv =
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production';
  const showDevToolbar =
    (!isProductionEnv || devCookieSet) && !isE2EClientRuntime;
  const DevToolbar = showDevToolbar
    ? (await import('@/features/dev/DevToolbar')).DevToolbar
    : null;
  const devEnv =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const devSha = (process.env.NEXT_PUBLIC_BUILD_SHA ?? '').slice(0, 7);
  const devVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '';

  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // CSP nonce is injected automatically by Next.js from the Content-Security-Policy
  // response header set by the middleware (proxy.ts). No need to read headers() here,
  // which would force all routes into dynamic rendering.
  // Cookie banner visibility is determined client-side by reading document.cookie.

  const headContent = (
    <head>
      {isE2EClientRuntime ? null : (
        <Script src='/theme-init.js' strategy='beforeInteractive' />
      )}
      {/* Icons and manifest are now handled by Next.js metadata export */}

      {/* DNS Prefetch and Preconnect for critical external resources */}
      {/* Spotify CDN - artist images */}
      <link rel='dns-prefetch' href='https://i.scdn.co' />
      <link rel='preconnect' href='https://i.scdn.co' crossOrigin='anonymous' />
      {/* Note: Font preloading is handled automatically by Next.js localFont */}
      {/* Spotify API */}
      <link rel='dns-prefetch' href='https://api.spotify.com' />
      {/* Vercel Blob Storage - avatar images */}
      <link rel='dns-prefetch' href='https://public.blob.vercel-storage.com' />
      <link
        rel='preconnect'
        href='https://public.blob.vercel-storage.com'
        crossOrigin='anonymous'
      />
      {/* Clerk Auth - authentication */}
      <link rel='dns-prefetch' href='https://clerk.jov.ie' />
      <link
        rel='preconnect'
        href='https://clerk.jov.ie'
        crossOrigin='anonymous'
      />
      <link rel='dns-prefetch' href='https://img.clerk.com' />
      <link
        rel='preconnect'
        href='https://img.clerk.com'
        crossOrigin='anonymous'
      />
      {/* Clerk Auth API */}
      <link
        rel='preconnect'
        href='https://api.clerk.com'
        crossOrigin='anonymous'
      />
      <link
        rel='preconnect'
        href='https://images.clerk.dev'
        crossOrigin='anonymous'
      />
      {/* Unsplash - fallback images */}
      <link rel='dns-prefetch' href='https://images.unsplash.com' />
      <link
        rel='preconnect'
        href='https://images.unsplash.com'
        crossOrigin='anonymous'
      />

      {/* Structured Data: WebSite + Organization (global, all pages) */}
      {isE2EClientRuntime ? null : (
        <>
          <Script
            id='website-schema'
            type='application/ld+json'
            strategy='afterInteractive'
            suppressHydrationWarning
          >
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: APP_NAME,
              alternateName: ['Jovie', 'jov.ie', 'Jovie Link in Bio'],
              url: APP_URL,
              description:
                'Jovie is the smartest link in bio for music artists. Connect your music, social media, and merch in one place.',
              inLanguage: 'en-US',
              publisher: {
                '@type': 'Organization',
                name: APP_NAME,
                url: APP_URL,
              },
            })}
          </Script>
          <Script
            id='organization-schema'
            type='application/ld+json'
            strategy='afterInteractive'
            suppressHydrationWarning
          >
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: APP_NAME,
              legalName: 'Jovie Technology Inc.',
              url: APP_URL,
              logo: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
              description:
                'Jovie is the smartest link in bio for music artists. Connect your music, social media, and merch in one place.',
              sameAs: [
                'https://x.com/jovieapp',
                'https://instagram.com/jovieapp',
              ],
            })}
          </Script>
        </>
      )}
    </head>
  );

  const bodyClassName = `${inter.variable} font-sans antialiased bg-base text-primary-token`;

  // Early return if no publishable key (only in production)
  if (!publishableKey) {
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      logger.debug('Bypassing Clerk authentication (no keys provided)');
      // In test/dev mode, continue rendering without Clerk
    } else {
      // In production, report to Sentry and show configuration error
      // This helps track intermittent cold start issues where env vars may be unavailable
      Sentry.captureMessage('Clerk publishableKey missing in production', {
        level: 'error',
        tags: {
          context: 'root_layout_clerk_key_missing',
          vercel_env: env.VERCEL_ENV || 'unknown',
          node_env: env.NODE_ENV,
        },
        extra: {
          has_clerk_key_in_public_env:
            !!publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
          // VERCEL_REGION is not in the env schema; use process.env for diagnostic
          vercel_region: process.env.VERCEL_REGION,
        },
      });

      return (
        <html lang='en' suppressHydrationWarning>
          {headContent}
          <body className={bodyClassName}>
            <div className='flex items-center justify-center min-h-screen'>
              <div className='text-center'>
                <h1 className='text-2xl font-bold text-red-600 mb-4'>
                  Configuration Error
                </h1>
                <p className='text-gray-600'>
                  Clerk publishable key is not configured.
                </p>
              </div>
            </div>
          </body>
        </html>
      );
    }
  }

  // publishableKey may be undefined in test/dev mode
  // CoreProviders handle base client providers; Clerk is mounted per route.
  return (
    <html lang='en' className='dark' suppressHydrationWarning>
      {headContent}
      <body className={bodyClassName}>
        <CoreProviders>
          {children}
          {DevToolbar && (
            <DevToolbar env={devEnv} sha={devSha} version={devVersion} />
          )}
        </CoreProviders>

        <CookieBannerSection />
      </body>
    </html>
  );
}
