import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';

export const revalidate = false;

export const metadata: Metadata = {
  title: `${APP_NAME} Pricing`,
  description:
    'Start free with unlimited smart links. Upgrade to Pro for release notifications, advanced analytics, and more.',
  alternates: {
    canonical: `${BASE_URL}/pricing`,
  },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description:
      'Start free with unlimited smart links. Upgrade to Pro for release notifications, advanced analytics, and more.',
    url: `${BASE_URL}/pricing`,
  },
  twitter: {
    card: 'summary',
    title: `${APP_NAME} Pricing`,
    description:
      'Start free with unlimited smart links. Upgrade to Pro for release notifications, advanced analytics, and more.',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
