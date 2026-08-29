import type { Metadata } from 'next';
import { Suspense } from 'react';
import { env } from '@/lib/env-server';
import { YoutubeThumbnailSuccessClient } from './YoutubeThumbnailSuccessClient';

export const metadata: Metadata = {
  title: 'YouTube Thumbnails Founder Access',
  robots: { index: false, follow: false },
};

export default function YoutubeThumbnailSuccessPage() {
  return (
    <Suspense fallback={<div className='mx-auto min-h-80 max-w-xl skeleton' />}>
      <YoutubeThumbnailSuccessClient
        founderPriceId={
          env.STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY ?? null
        }
      />
    </Suspense>
  );
}
