'use client';

import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';

/**
 * Platform display names for music links.
 * Uses readable names instead of raw identifiers.
 */
const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  tidal: 'TIDAL',
  deezer: 'Deezer',
  bandcamp: 'Bandcamp',
};

interface ThankYouClientProps {
  readonly handle: string;
  readonly artistName: string;
  readonly avatarUrl: string | null;
  readonly musicLinks: readonly { platform: string; url: string }[];
}

export function ThankYouClient({
  handle,
  artistName,
  avatarUrl,
  musicLinks,
}: ThankYouClientProps) {
  return (
    <div className='min-h-dvh bg-base flex flex-col items-center justify-center px-4 py-8'>
      <div className='w-full max-w-md mx-auto text-center'>
        {/* Success icon */}
        <div className='inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 mb-6'>
          <Check className='h-8 w-8 text-green-400' aria-hidden />
        </div>

        {/* Artist avatar */}
        <div className='h-20 w-20 rounded-full overflow-hidden mx-auto mb-4 bg-surface-2'>
          <ImageWithFallback
            src={avatarUrl}
            alt={artistName}
            width={80}
            height={80}
            className='h-full w-full object-cover'
            fallbackVariant='avatar'
          />
        </div>

        <h1 className='text-xl font-semibold text-primary-token mb-2'>
          Thank you for your support!
        </h1>
        <p className='text-sm text-secondary-token mb-8'>
          Your tip has been sent to {artistName}. It means a lot to independent
          artists.
        </p>

        {/* Music links */}
        {musicLinks.length > 0 && (
          <div className='rounded-xl border border-white/[0.08] bg-surface-1 p-6 mb-6 text-left'>
            <h2 className='text-sm font-medium text-secondary-token mb-4'>
              Listen to {artistName}
            </h2>
            <div className='flex flex-col gap-2'>
              {musicLinks.map(link => (
                <a
                  key={link.platform}
                  href={link.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={cn(
                    'flex items-center justify-between h-11 px-4 rounded-lg',
                    'bg-surface-2 border border-white/[0.06]',
                    'text-sm text-primary-token hover:bg-white/[0.06] transition-colors'
                  )}
                >
                  <span>{PLATFORM_LABELS[link.platform] || link.platform}</span>
                  <ExternalLink
                    className='h-3.5 w-3.5 text-tertiary-token'
                    aria-hidden
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Back to profile */}
        <Link
          href={`/${handle}`}
          className='inline-flex items-center gap-1.5 text-sm text-secondary-token hover:text-primary-token transition-colors'
        >
          <ArrowLeft className='h-4 w-4' aria-hidden />
          <span>Back to profile</span>
        </Link>
      </div>
    </div>
  );
}
