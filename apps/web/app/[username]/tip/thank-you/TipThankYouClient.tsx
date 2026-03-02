'use client';

import Link from 'next/link';
import { RetargetingPixels } from '@/components/tracking';

interface TipThankYouClientProps {
  readonly profileId: string;
  readonly artistName: string;
  readonly handle: string;
  readonly sessionId: string | null;
  readonly retargetingEnabled: boolean;
}

/**
 * Client component for the tip thank-you page.
 *
 * Renders a confirmation message and fires retargeting conversion
 * events (Purchase) via Meta Pixel and Google Ads gtag when enabled.
 */
export function TipThankYouClient({
  profileId,
  artistName,
  handle,
  retargetingEnabled,
}: TipThankYouClientProps) {
  return (
    <div className='flex min-h-dvh items-center justify-center bg-base px-4'>
      <div className='w-full max-w-sm text-center'>
        <div className='mb-6 text-5xl' aria-hidden='true'>
          <svg
            className='mx-auto h-12 w-12 text-green-500'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth={2}
            stroke='currentColor'
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
            />
          </svg>
        </div>
        <h1 className='text-xl font-semibold text-primary-token'>
          Thank you for your tip!
        </h1>
        <p className='mt-2 text-sm text-secondary-token'>
          Your support means the world to {artistName}.
        </p>
        <Link
          href={`/${handle}`}
          className='mt-6 inline-block rounded-lg bg-interactive px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-interactive/90'
        >
          Back to profile
        </Link>
      </div>

      {/* Fire retargeting conversion event for completed tip */}
      {retargetingEnabled ? (
        <RetargetingPixels profileId={profileId} fireConversion />
      ) : null}
    </div>
  );
}
