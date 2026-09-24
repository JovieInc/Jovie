import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { SmartLinksLanding } from './SmartLinksLanding';

export const revalidate = false;

const title = 'Music Smart Links';
const description =
  'One release link that remembers where each fan listens. Explore the haptic streaming dial and create a Smart Link for your music.';
const url = `${BASE_URL}${APP_ROUTES.SMART_LINKS}`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: {
    type: 'website',
    title: `${title} | ${APP_NAME}`,
    description,
    url,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
};

export default function SmartLinksPage() {
  return <SmartLinksLanding />;
}
