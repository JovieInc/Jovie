import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';

export const revalidate = false;

export const metadata: Metadata = {
  title: `${APP_NAME} Pricing`,
  description: 'Jovie pricing for your profile, smart links, and audience.',
  alternates: {
    canonical: `${BASE_URL}/pricing`,
  },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description: 'Jovie pricing for your profile, smart links, and audience.',
    url: `${BASE_URL}/pricing`,
  },
  twitter: {
    card: 'summary',
    title: `${APP_NAME} Pricing`,
    description: 'Jovie pricing for your profile, smart links, and audience.',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
