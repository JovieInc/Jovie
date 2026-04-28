import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import React from 'react';
import { APP_NAME, BASE_URL } from '@/constants/app';
import './globals.css';
import { CookieBannerMount } from '@/components/organisms/CookieBannerMount';
import { InstantlyPixel } from '@/components/providers/InstantlyPixel';
import { getRootLayoutChromeState } from '@/lib/demo-recording';
import { publicEnv } from '@/lib/env-public';

const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

const satoshi = localFont({
  src: '../public/fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  display: 'swap',
  weight: '300 900',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'One link to launch your music career. Smart links, fan notifications, and AI for independent musicians.',
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
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    title: APP_NAME,
    description:
      'One link to launch your music career. Smart links, fan notifications, and AI for independent musicians.',
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
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
      'One link to launch your music career. Smart links, fan notifications, and AI for independent musicians.',
    images: [`${BASE_URL}/og/default.png`],
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
    'application-name': APP_NAME,
    'apple-mobile-web-app-capable': 'yes',
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
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
  auth,
}: Readonly<{
  children: React.ReactNode;
  auth: React.ReactNode;
}>) {
  const isE2EClientRuntime =
    process.env.NEXT_PUBLIC_E2E_MODE === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
  const clerkMockEnabled = process.env.NEXT_PUBLIC_CLERK_MOCK === '1';
  const clerkProxyDisabled =
    process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1';
  const devEnv =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const devSha = (process.env.NEXT_PUBLIC_BUILD_SHA ?? '').slice(0, 7);
  const devVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
  const { isDemoRecording, shouldRenderCookieBanner, shouldRenderDevChrome } =
    getRootLayoutChromeState({
      devEnv,
      isE2EClientRuntime,
    });

  let devToolbar: React.ReactNode = null;
  let FlagBadgeProvider: React.ComponentType<{
    children: React.ReactNode;
  }> | null = null;

  if (shouldRenderDevChrome) {
    const { DevToolbarGate } = await import(
      '@/components/features/dev/DevToolbarGate'
    );
    const flagBadgeMod = await import(
      '@/components/features/dev/FlagBadgeContext'
    );
    FlagBadgeProvider = flagBadgeMod.FlagBadgeProvider;

    devToolbar = (
      <DevToolbarGate
        disabled={false}
        env={devEnv}
        sha={devSha}
        version={devVersion}
      />
    );
  }

  const bodyClassName = `${inter.variable} ${satoshi.variable} font-sans antialiased bg-base text-primary-token`;

  const content = (
    <>
      {children}
      {auth}
      {devToolbar}
      {shouldRenderCookieBanner ? <CookieBannerMount /> : null}
      <InstantlyPixel />
    </>
  );

  return (
    <html
      lang='en'
      className='dark'
      data-clerk-mock={clerkMockEnabled ? '1' : undefined}
      data-clerk-proxy-disabled={clerkProxyDisabled ? '1' : undefined}
      data-e2e-mode={isE2EClientRuntime ? '1' : undefined}
      data-demo-recording={isDemoRecording ? '1' : undefined}
      data-dev-chrome-disabled={shouldRenderDevChrome ? undefined : '1'}
      data-scroll-behavior='smooth'
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Theme init must run before first paint and stays static in /public. */}
        <script src='/theme-init.js' />
      </head>
      <body className={bodyClassName}>
        {FlagBadgeProvider ? (
          <FlagBadgeProvider>{content}</FlagBadgeProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
