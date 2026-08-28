import type { Metadata } from 'next';
import { Suspense } from 'react';
import { env } from '@/lib/env-server';
import { YoutubeThumbnailCheckoutClient } from './YoutubeThumbnailCheckoutClient';

export const metadata: Metadata = {
  title: 'YouTube Thumbnails Founder Checkout',
  robots: { index: false, follow: false },
};

export default function YoutubeThumbnailCheckoutPage() {
  return (
    <Suspense
      fallback={<div className='mx-auto min-h-[28rem] max-w-xl skeleton' />}
    >
      <YoutubeThumbnailCheckoutClient
        priceId={env.STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY ?? null}
      />
    </Suspense>
  );
}
