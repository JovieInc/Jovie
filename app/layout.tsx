import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { APP_NAME, APP_URL } from '@/constants/app';
// Feature flags removed - pre-launch
// import { runStartupEnvironmentValidation } from '@/lib/startup/environment-validator'; // Moved to build-time for performance
import './globals.css';
import { headers } from 'next/headers';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { publicEnv } from '@/lib/env-public';
import { ensureSentry } from '@/lib/sentry/ensure';
import { logger } from '@/lib/utils/logger';

// Configure Inter font with variable weight to support Linear's 538 weight
const inter = Inter({
  subsets: ['latin'],
  weight: 'variable', // Use variable font for full weight range (100-900) including 538
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
  preload: true,
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
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureSentry();
  // Check if cookie banner should be shown
  const headersList = await headers();
  const showCookieBanner = headersList.get('x-show-cookie-banner') === '1';
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const headContent = (
    <head>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  try {
    var ls = localStorage.getItem('jovie-theme');
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var pref = ls && ls !== 'system' ? ls : (mql.matches ? 'dark' : 'light');
    var root = document.documentElement;
    if (pref === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
  } catch (e) {}
})();
`,
        }}
      />
      {/* Icons and manifest are now handled by Next.js metadata export */}

      {/* DNS Prefetch for critical external resources */}
      <link rel='dns-prefetch' href='https://i.scdn.co' />
      <link rel='dns-prefetch' href='https://api.spotify.com' />
      <link rel='dns-prefetch' href='https://images.unsplash.com' />
      <link rel='preconnect' href='https://i.scdn.co' crossOrigin='' />
      <link
        rel='preconnect'
        href='https://images.unsplash.com'
        crossOrigin=''
      />

      {/* Structured Data for Organization */}
      <script
        type='application/ld+json'
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

  // Early return if no publishable key
  if (!publishableKey) {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      logger.debug('Bypassing Clerk authentication (no keys provided)');
    }

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

  // publishableKey is guaranteed to be defined here
  return (
    <html lang='en' suppressHydrationWarning>
      {headContent}
      <body className={bodyClassName}>
        <ClientProviders publishableKey={publishableKey}>
          {children}
        </ClientProviders>

        {showCookieBanner && <CookieBannerSection />}
        <Analytics />
        <SpeedInsights />
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  );
}
