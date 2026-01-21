import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SentryExamplePageClient } from './SentryExamplePageClient';

export const metadata: Metadata = {
  title: 'sentry-example-page',
  description: 'Test Sentry for your Next.js app!',
};

export default function Page() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <SentryExamplePageClient />;
}
