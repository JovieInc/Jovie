import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import React from 'react';
import { APP_NAME, BASE_URL } from '@/constants/app';
// Feature flags removed - pre-launch
// import { runStartupEnvironmentValidation } from '@/lib/startup/environment-validator'; // Moved to build-time for performance
import './globals.css';
import { CookieBannerMount } from '@/components/organisms/CookieBannerMount';
import { publicEnv } from '@/lib/env-public';

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
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isE2EClientRuntime = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  // Keep the root layout fully static for public/ISR routes. Dev toolbar visibility
  // is resolved client-side so a production cookie doesn't force per-request SSR.
  const devEnv =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const devSha = (process.env.NEXT_PUBLIC_BUILD_SHA ?? '').slice(0, 7);
  const devVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '';

  // CSP nonce is injected automatically by Next.js from the Content-Security-Policy
  // response header set by the middleware (proxy.ts). No need to read headers() here,
  // which would force all routes into dynamic rendering.
  // Cookie banner visibility is determined client-side by reading document.cookie.
  let devToolbar: React.ReactNode = null;

  if (!(isE2EClientRuntime || devEnv === 'production')) {
    const { DevToolbarGate } = await import(
      '@/components/features/dev/DevToolbarGate'
    );

    devToolbar = (
      <DevToolbarGate
        disabled={false}
        env={devEnv}
        sha={devSha}
        version={devVersion}
      />
    );
  }

  const bodyClassName = `${inter.variable} font-sans antialiased bg-base text-primary-token`;
  return (
    <html
      lang='en'
      className='dark'
      data-scroll-behavior='smooth'
      suppressHydrationWarning
    >
      <head />
      <body className={bodyClassName}>
        {children}
        {devToolbar}
        <CookieBannerMount />
      </body>
    </html>
  );
}
