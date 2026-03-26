import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';

export const metadata: Metadata = {
  title: `${APP_NAME} Pricing`,
  description:
    'Free forever. Remove branding for $5. Beautiful, fast artist profiles with deep links and conversion-focused analytics.',
  alternates: {
    canonical: `${BASE_URL}/pricing`,
  },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description:
      'Free forever. Remove branding for $5. Beautiful, fast artist profiles with deep links and conversion-focused analytics.',
    url: `${BASE_URL}/pricing`,
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
