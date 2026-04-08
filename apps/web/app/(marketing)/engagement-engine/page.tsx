import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { EngagementEngineLanding } from '@/features/home/EngagementEngineLanding';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = 'An Always-On Engagement Engine';
  const ogTitle = `${APP_NAME} - An Always-On Engagement Engine`;
  const description =
    'Turn attention into a warm list. Personalize per fan. Follow up automatically.';

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `${BASE_URL}/engagement-engine`,
    },
    openGraph: {
      type: 'website',
      title: ogTitle,
      description,
      url: `${BASE_URL}/engagement-engine`,
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
      index: false,
      follow: true,
    },
  };
}

export default function EngagementEnginePage() {
  return <EngagementEngineLanding />;
}
