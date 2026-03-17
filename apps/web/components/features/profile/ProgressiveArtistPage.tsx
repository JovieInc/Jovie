'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ProfileMode } from '@/features/profile/contracts';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

// Lazy load the animated version
const AnimatedArtistPage = dynamic(
  () =>
    import('@/features/profile/animated-artist-page').then(mod => ({
      default: mod.AnimatedArtistPage,
    })),
  {
    ssr: false,
    loading: () => null, // Don't show loading, use static version
  }
);

interface ProgressiveArtistPageProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showTipButton: boolean;
  readonly showBackButton: boolean;
}

export function ProgressiveArtistPage(props: ProgressiveArtistPageProps) {
  const [shouldUseAnimated, setShouldUseAnimated] = useState(false);
  const router = useRouter();

  // Prefetch all artist modes for snappy transitions
  useEffect(() => {
    const base = `/${props.artist.handle}`;
    ['profile', 'listen', 'tip']
      .filter(m => m !== props.mode)
      .forEach(mode => {
        const searchUrl = mode === 'profile' ? base : `${base}?mode=${mode}`;
        router.prefetch(searchUrl);
        router.prefetch(`${base}/${mode}`);
      });
  }, [router, props.artist.handle, props.mode]);

  useEffect(() => {
    if (props.mode === 'profile' || props.mode === 'listen') {
      return; // Don't upgrade to animated for listen mode
    }

    // Only load animations after hydration with no delay for other modes
    setShouldUseAnimated(true);
  }, [props.mode]);

  // Start with static version for immediate rendering
  if (!shouldUseAnimated) {
    return <StaticArtistPage {...props} />;
  }

  // Upgrade to animated version after hydration
  return <AnimatedArtistPage {...props} />;
}
