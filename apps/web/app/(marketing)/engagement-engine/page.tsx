import type { Metadata } from 'next';
import { EngagementEngineLanding } from '@/components/home/EngagementEngineLanding';
import { APP_NAME, APP_URL } from '@/constants/app';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - An Always-On Engagement Engine`;
  const description =
    'Turn attention into a warm list. Personalize per fan. Follow up automatically.';

  return {
    title,
    description,
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: `${APP_URL}/engagement-engine`,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/engagement-engine`,
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
      index: false,
      follow: true,
    },
  };
}

export default function EngagementEnginePage() {
  return <EngagementEngineLanding />;
}
