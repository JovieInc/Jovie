import type { Metadata } from 'next';
import { VoicePageContent } from '@/components/organisms/VoicePageContent';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Voice Cloning for Creators | Jovie',
  description:
    // ui-casing-allow: metadata sentence with brand name ElevenLabs
    'Turn any YouTube video into your trained AI voice in minutes. Consent-first cloning powered by ElevenLabs. Use it for promos, replies, and radio drops inside your Jovie flows.',
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/voice',
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/voice`,
    title: 'Voice Cloning for Creators | Jovie',
    description:
      'Clone your voice from YouTube. Train once. Sound like you everywhere.',
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: 'Jovie voice cloning hero',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voice Cloning for Creators | Jovie',
    description:
      'Clone your voice from YouTube. Train once. Sound like you everywhere.',
    images: [`${BASE_URL}/og/default.png`],
  },
  robots: NOINDEX_ROBOTS,
};

export default function VoiceLandingPage() {
  return <VoicePageContent />;
}
