import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getStripePriceIds } from '@/lib/stripe/price-ids';
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
          getStripePriceIds().youtubeThumbnailsFounderMonthly ?? null
        }
      />
    </Suspense>
  );
}
