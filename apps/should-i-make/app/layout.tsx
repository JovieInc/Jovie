import { Analytics } from '@vercel/analytics/react';
import type { Metadata } from 'next';
import './globals.css';

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
    <html lang='en'>
      <head>
        <link
          rel='preconnect'
          href='https://fonts.googleapis.com'
          crossOrigin='anonymous'
        />
        <link
          rel='preconnect'
          href='https://fonts.gstatic.com'
          crossOrigin='anonymous'
        />
        <link
          href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
          rel='stylesheet'
        />
      </head>
      <body className='antialiased'>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
