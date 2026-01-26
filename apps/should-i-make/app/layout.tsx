import { Analytics } from '@vercel/analytics/react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Configure Inter font from local file (no external network requests during build)
const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Should I Make a Music Video? | Honest Calculator for Indie Artists',
  description:
    'Find out if you should spend money on a music video or invest in marketing instead. A brutally honest tool for independent musicians.',
  keywords:
    'music video budget, indie artist advice, music marketing, should I make a music video',
  openGraph: {
    title: 'Should I Make a Music Video?',
    description: 'The brutally honest calculator for indie artists.',
    url: 'https://shouldimakeamusicvideo.com',
    siteName: 'Should I Make a Music Video',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Should I Make a Music Video?',
    description: 'The brutally honest calculator for indie artists.',
  },
  robots: 'index, follow',
  alternates: {
    canonical: 'https://shouldimakeamusicvideo.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' className={inter.variable}>
      <head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
      </head>
      <body className='antialiased font-sans'>
        <a
          href='#main-content'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:border-2 focus:border-black focus:rounded'
        >
          Skip to main content
        </a>
        <main id='main-content'>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
