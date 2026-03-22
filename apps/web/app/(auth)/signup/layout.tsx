import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';

const title = `Sign up | ${APP_NAME}`;
const description =
  'Create your Jovie account to launch your artist profile, share smarter music links, and turn every release into momentum.';
const imageUrl = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/signup',
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/signup`,
    title,
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
    title,
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
