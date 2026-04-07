/**
 * ScheduledReleasePage Component
 *
 * Minimal "Coming Soon" page shown for unreleased content from free-plan
 * creators. No countdown, no "Notify Me" CTA, no release date display.
 */

import Link from 'next/link';
import {
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
} from '@/features/release/SmartLinkPagePrimitives';

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
    <SmartLinkPageFrame centered glowClassName='size-[30rem]'>
      <SmartLinkArtworkCard
        title={release.title}
        artworkUrl={release.artworkUrl}
        className='shadow-black/40'
      />

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
      <div className='mt-5 rounded-2xl bg-surface-1/50 p-4 text-center ring-1 ring-inset ring-white/[0.08]'>
        <p className='text-muted-foreground text-sm font-medium'>Coming Soon</p>
      </div>
    </SmartLinkPageFrame>
  );
}
