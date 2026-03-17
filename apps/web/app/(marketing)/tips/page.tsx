import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { TipsLanding } from '@/features/tips/TipsLanding';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} — Turn Every Tip Into a Fan`;
  const description =
    'Scan. Tip. Stream. One QR code turns a stranger into a superfan. Perfect for buskers, open mic nights, merch tables, and house shows.';

  return {
    title,
    description,
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: `${APP_URL}/tips`,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/tips`,
      siteName: APP_NAME,
      images: [
        {
          url: '/og/default.png',
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/default.png'],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function TipsPage() {
  return <TipsLanding />;
}
