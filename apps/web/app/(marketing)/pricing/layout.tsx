import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';

export const revalidate = false;

export const metadata: Metadata = {
  title: `${APP_NAME} Pricing`,
  description:
    'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
  alternates: {
    canonical: `${BASE_URL}/pricing`,
  },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description:
      'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
    url: `${BASE_URL}/pricing`,
  },
  twitter: {
    card: 'summary',
    title: `${APP_NAME} Pricing`,
    description:
      'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
