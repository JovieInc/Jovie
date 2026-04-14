import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { PayLanding } from '@/features/pay/PayLanding';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Turn Every Payment Into a Fan';
  const ogTitle = `${APP_NAME} — Turn Every Payment Into a Fan`;
  const description =
    'Scan. Pay. Stream. One QR code turns a stranger into a superfan. Perfect for buskers, open mic nights, merch tables, and house shows.';

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `${BASE_URL}/pay`,
    },
    openGraph: {
      type: 'website',
      title: ogTitle,
      description,
      url: `${BASE_URL}/pay`,
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
      title: ogTitle,
      description,
      images: ['/og/default.png'],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function PayPage() {
  return <PayLanding />;
}
