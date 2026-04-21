import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { UnavailablePage } from '@/components/UnavailablePage';
import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { getOperationalControls } from '@/lib/admin/operational-controls';

const ogTitle = `Sign up | ${APP_NAME}`;
const description =
  'Create your Jovie account to launch your artist profile, share smarter music links, and turn every release into momentum.';
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

export default async function SignUpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  noStore();

  const controls = await getOperationalControls();
  if (!controls.signupEnabled) {
    return <UnavailablePage />;
  }

  return children;
}
