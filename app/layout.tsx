import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import { ClerkAppProvider } from '@/components/providers/ClerkAppProvider';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { APP_NAME, APP_URL } from '@/constants/app';
// Feature flags removed - pre-launch
// import { runStartupEnvironmentValidation } from '@/lib/startup/environment-validator'; // Moved to build-time for performance
import './globals.css';
import { headers } from 'next/headers';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';

// Configure Inter font
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Link in bio for music artists. Connect your music, social media, and merch in one link. No design needed.',
  keywords: [
    'link in bio',
    'music artist',
    'spotify',
    'social media',
    'music promotion',
    'artist profile',
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
      'Link in bio for music artists. Connect your music, social media, and merch in one link. No design needed.',
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
      'Link in bio for music artists. Connect your music, social media, and merch in one link. No design needed.',
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
    google: 'your-google-verification-code',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': APP_NAME,
    'application-name': APP_NAME,
    'msapplication-TileColor': '#6366f1',
    'theme-color': '#ffffff',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Extract domain from APP_URL for analytics
  const analyticsDomain = APP_URL.replace(/^https?:\/\//, '');

  // Check if cookie banner should be shown
  const headersList = await headers();
  const showCookieBanner = headersList.get('x-show-cookie-banner') === '1';
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';

  return (
    <html lang='en' suppressHydrationWarning>
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
        {/* Favicon and Icons */}
        <link rel='icon' href='/favicon.ico' type='image/x-icon' />
        <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
        <link rel='manifest' href='/site.webmanifest' />

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

        {/* Vercel Page Speed Insights */}
        <script
          defer
          data-domain={analyticsDomain}
          src='https://vitals.vercel-insights.com/v1/vitals.js'
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
              logo: `${APP_URL}/brand/jovie-logo.svg`,
              description:
                'Link in bio for music artists. Connect your music, social media, and merch in one link.',
              sameAs: [
                'https://twitter.com/jovie',
                'https://instagram.com/jovie',
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans bg-base text-primary-token`}
      >
        <ClerkAppProvider>
          <ClientProviders>{children}</ClientProviders>
        </ClerkAppProvider>
        {showCookieBanner && <CookieBannerSection />}
        {/* <SpeedInsights /> */}
        {shouldInjectToolbar && (
          <>
            <VercelToolbar />
          </>
        )}
      </body>
    </html>
  );
}
