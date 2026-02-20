/**
 * ScheduledReleasePage Component
 *
 * Minimal "Coming Soon" page shown for unreleased content from free-plan
 * creators. No countdown, no "Notify Me" CTA, no release date display.
 * Matches the visual style of UnreleasedReleaseHero but stripped down.
 */

import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';

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
    <div className='min-h-dvh bg-black text-white'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[120px]' />
      </div>

      <main className='relative z-10 flex min-h-dvh flex-col items-center px-6'>
        <div className='min-h-6 flex-1' />

        <div className='w-full max-w-[272px]'>
          {/* Release Artwork */}
          <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-white/[0.04] shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='272px'
                priority
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='size-16 text-white/20'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>

          {/* Release Info */}
          <div className='mt-4 text-center'>
            <h1 className='text-[17px] font-semibold leading-snug tracking-tight'>
              {release.title}
            </h1>
            <Link
              href={`/${artist.handle}`}
              className='mt-1 block text-[13px] text-white/50 transition-colors hover:text-white/70'
            >
              {artist.name}
            </Link>
          </div>

          {/* Coming Soon */}
          <div className='mt-5 rounded-xl bg-white/[0.05] p-4 ring-1 ring-inset ring-white/[0.06] text-center'>
            <p className='text-sm font-medium text-white/60'>Coming Soon</p>
          </div>
        </div>

        <div className='min-h-6 flex-1' />

        {/* Jovie Branding */}
        <footer className='shrink-0 pb-5 text-center'>
          <Link
            href='/'
            className='inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/20 transition-colors hover:text-white/35'
          >
            <span>Powered by</span>
            <span className='font-semibold'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
