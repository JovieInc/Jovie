import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';

export const metadata: Metadata = {
  title: `${APP_NAME} Pricing`,
  description:
    'Free forever. Remove branding for $5. Beautiful, fast artist profiles with deep links and conversion-focused analytics.',
  alternates: {
    canonical: `${APP_URL}/pricing`,
  },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description:
      'Free forever. Remove branding for $5. Beautiful, fast artist profiles with deep links and conversion-focused analytics.',
    url: `${APP_URL}/pricing`,
  },
  twitter: {
    card: 'summary',
    title: `${APP_NAME} Pricing`,
    description:
      'Free forever. Remove branding for $5. Beautiful, fast artist profiles with deep links and conversion-focused analytics.',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
