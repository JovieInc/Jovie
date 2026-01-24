import * as Sentry from '@sentry/nextjs';
import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import { CoreProviders } from '@/components/providers/CoreProviders';
import { APP_NAME, APP_URL } from '@/constants/app';
// Feature flags removed - pre-launch
// import { runStartupEnvironmentValidation } from '@/lib/startup/environment-validator'; // Moved to build-time for performance
import './globals.css';
import { headers } from 'next/headers';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { SCRIPT_NONCE_HEADER } from '@/lib/security/content-security-policy';
import { ensureSentry } from '@/lib/sentry/ensure';
import { logger } from '@/lib/utils/logger';

// Configure Inter Variable font (app-wide)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Artist profiles for music artists. Connect your music, social media, and merch in one place. No design needed.',
  keywords: [
    'artist profile',
    'music artist',
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
      'Artist profiles for music artists. Connect your music, social media, and merch in one place. No design needed.',
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
      'Artist profiles for music artists. Connect your music, social media, and merch in one place. No design needed.',
    images: [`${APP_URL}/og/default.png`],
    creator: '@jovie',
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
    'apple-mobile-web-app-status-bar-style': 'default',
    'application-name': APP_NAME,
    'msapplication-TileColor': '#6366f1',
    'msapplication-TileImage': '/android-chrome-192x192.png',
    'msapplication-config': 'none',
    'theme-color': '#ffffff',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
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
  manifest: '/site.webmanifest',
};

// Viewport configuration with viewport-fit=cover for iOS safe area insets
export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureSentry();
  // Check if cookie banner should be shown
  const headersList = await headers();
  const showCookieBanner = headersList.get('x-show-cookie-banner') === '1';
  const nonce = headersList.get(SCRIPT_NONCE_HEADER) ?? undefined;
  const shouldInjectToolbar = env.NODE_ENV === 'development';
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const headContent = (
    <head>
      <script
        nonce={nonce}
        suppressHydrationWarning
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for theme script injection
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  try {
    var ls = localStorage.getItem('jovie-theme');
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var systemPref = mql.matches ? 'dark' : 'light';
    var pref = (ls && ls !== 'system') ? ls : systemPref;
    var root = document.documentElement;
    if (pref === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
  } catch (e) { /* Theme detection failed - defaults will apply */ }
})();
`,
        }}
      />
      {/* Icons and manifest are now handled by Next.js metadata export */}

      {/* DNS Prefetch and Preconnect for critical external resources */}
      {/* Spotify CDN - artist images */}
      <link rel='dns-prefetch' href='https://i.scdn.co' />
      <link rel='preconnect' href='https://i.scdn.co' crossOrigin='' />
      {/* Spotify API */}
      <link rel='dns-prefetch' href='https://api.spotify.com' />
      {/* Vercel Blob Storage - avatar images */}
      <link rel='dns-prefetch' href='https://public.blob.vercel-storage.com' />
      <link
        rel='preconnect'
        href='https://public.blob.vercel-storage.com'
        crossOrigin=''
      />
      {/* Clerk Auth - authentication */}
      <link rel='dns-prefetch' href='https://clerk.jov.ie' />
      <link rel='preconnect' href='https://clerk.jov.ie' crossOrigin='' />
      <link rel='dns-prefetch' href='https://img.clerk.com' />
      <link rel='preconnect' href='https://img.clerk.com' crossOrigin='' />
      {/* Unsplash - fallback images */}
      <link rel='dns-prefetch' href='https://images.unsplash.com' />
      <link
        rel='preconnect'
        href='https://images.unsplash.com'
        crossOrigin=''
      />

      {/* Structured Data for Organization */}
      <script
        type='application/ld+json'
        nonce={nonce}
        suppressHydrationWarning
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: APP_NAME,
            url: APP_URL,
            logo: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
            description:
              'Artist profiles for music artists. Connect your music, social media, and merch in one place.',
            sameAs: [
              'https://twitter.com/jovie',
              'https://instagram.com/jovie',
            ],
          }),
        }}
      />
    </head>
  );

  const bodyClassName = `${inter.variable} font-sans bg-base text-primary-token`;

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
          vercel_env: process.env.VERCEL_ENV || 'unknown',
          node_env: process.env.NODE_ENV,
        },
        extra: {
          has_clerk_key_in_process_env:
            !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
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
    <html lang='en' suppressHydrationWarning>
      {headContent}
      <body className={bodyClassName}>
        {/* Skip to main content link for keyboard accessibility */}
        <a
          href='#main-content'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:bg-btn-primary focus:text-btn-primary-foreground focus:rounded-md focus:text-sm focus:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        >
          Skip to main content
        </a>
        <CoreProviders>{children}</CoreProviders>

        <CookieBannerSection showBanner={showCookieBanner} />
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  );
}
