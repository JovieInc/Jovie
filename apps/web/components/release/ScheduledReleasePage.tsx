/**
 * ScheduledReleasePage Component
 *
 * Minimal "Coming Soon" page shown for unreleased content from free-plan
 * creators. No countdown, no "Notify Me" CTA, no release date display.
 * Matches the visual style of UnreleasedReleaseHero but stripped down.
 */

import Link from 'next/link';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';

interface ScheduledReleasePageProps {
  readonly release: {
    readonly title: string;
    readonly artworkUrl: string | null;
  };
  readonly artist: {
    readonly name: string;
    readonly handle: string;
  };
}

export function ScheduledReleasePage({
  release,
  artist,
}: ScheduledReleasePageProps) {
  return (
    <div className='min-h-dvh bg-base text-foreground'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='bg-foreground/5 absolute left-1/2 top-1/3 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]' />
      </div>

      <main className='relative z-10 flex min-h-dvh flex-col items-center px-6'>
        <div className='min-h-6 flex-1' />

        <div className='w-full max-w-[17rem]'>
          {/* Release Artwork */}
          <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-surface-1/30 shadow-2xl shadow-black/40 ring-1 ring-white/[0.08]'>
            <ImageWithFallback
              src={release.artworkUrl}
              alt={`${release.title} artwork`}
              fill
              className='object-cover'
              sizes='272px'
              priority
              fallbackVariant='release'
            />
          </div>

          {/* Release Info */}
          <div className='mt-4 text-center'>
            <h1 className='text-lg font-semibold leading-snug tracking-tight'>
              {release.title}
            </h1>
            <Link
              href={`/${artist.handle}`}
              className='text-muted-foreground hover:text-foreground mt-1 block text-sm transition-colors'
            >
              {artist.name}
            </Link>
          </div>

          {/* Coming Soon */}
          <div className='mt-5 rounded-xl bg-surface-1/50 p-4 text-center ring-1 ring-inset ring-white/[0.05]'>
            <p className='text-muted-foreground text-sm font-medium'>
              Coming Soon
            </p>
          </div>
        </div>

        <div className='min-h-6 flex-1' />

        {/* Jovie Branding */}
        <footer className='shrink-0 pb-5 text-center'>
          <Link
            href='/'
            className='text-muted-foreground/70 hover:text-foreground/90 inline-flex items-center gap-1 text-2xs uppercase tracking-widest transition-colors'
          >
            <span>Powered by</span>
            <span className='font-semibold'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
