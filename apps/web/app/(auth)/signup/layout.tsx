import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

const ogTitle = `Sign up | ${APP_NAME}`;
const description = COMPANY_IDENTITY.signupDescription;
const imageUrl = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: 'Sign up',
  description,
  alternates: {
    canonical: '/signup',
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/signup`,
    title: ogTitle,
    description,
    siteName: APP_NAME,
    locale: 'en_US',
    images: [
      {
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: 'Sign up for Jovie',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ogTitle,
    description,
    creator: '@jovieapp',
    site: '@jovieapp',
    images: [
      {
        url: imageUrl,
        alt: 'Sign up for Jovie',
      },
    ],
  },
};

export default function SignUpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
