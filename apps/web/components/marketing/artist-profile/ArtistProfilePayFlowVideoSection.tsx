'use client';

import { Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';

import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfilePayFlowVideoSection.css';

const POSTER_PATH = getMarketingExportImage(
  'tim-white-profile-pay-mobile'
).publicUrl;

interface ArtistProfilePayFlowVideoSectionProps {
  readonly copy: ArtistProfileLandingCopy['payFlowVideo'];
  readonly monetization: ArtistProfileLandingCopy['monetization'];
  readonly videoUrl: string | undefined;
}

type VideoState = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

export function ArtistProfilePayFlowVideoSection({
  copy,
  monetization,
  videoUrl,
}: Readonly<ArtistProfilePayFlowVideoSectionProps>) {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const initialState: VideoState = videoUrl ? 'loading' : 'error';
  const [state, setState] = useState<VideoState>(initialState);

  const handleLoadedData = useCallback(() => {
    setState(reducedMotion ? 'ready' : 'playing');
  }, [reducedMotion]);

  const handleError = useCallback(() => {
    setState('error');
  }, []);

  const handlePlayClick = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }, []);

  if (!videoUrl || state === 'error') {
    return <ArtistProfileMonetizationSection monetization={monetization} />;
  }

  const showPosterOverlay =
    state === 'loading' || (reducedMotion && state !== 'playing');

  return (
    <ArtistProfileSectionShell width='page'>
      <ArtistProfileSectionHeader
        headline={copy.headline}
        body={copy.subhead}
      />
      <div className='mt-12 sm:mt-14 lg:mt-16'>
        <ArtistProfilePhoneFrame>
          <div className='ap-payflow__frame relative h-full w-full'>
            <video
              ref={videoRef}
              aria-label={copy.ariaLabel}
              className='block h-full w-full object-cover'
              src={videoUrl}
              poster={POSTER_PATH}
              autoPlay={!reducedMotion}
              muted
              loop
              playsInline
              preload='metadata'
              onLoadedData={handleLoadedData}
              onError={handleError}
            />
            {showPosterOverlay ? (
              <div className='ap-payflow__overlay absolute inset-0 flex items-center justify-center'>
                <Image
                  alt={copy.posterAlt}
                  src={POSTER_PATH}
                  fill
                  sizes='(max-width: 768px) 80vw, 340px'
                  className='object-cover'
                  priority={false}
                />
                {reducedMotion ? (
                  <button
                    type='button'
                    onClick={handlePlayClick}
                    className='ap-payflow__play relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition'
                  >
                    <Play
                      aria-hidden='true'
                      className='size-4 fill-current'
                      strokeWidth={1.8}
                    />
                    {copy.playLabel}
                  </button>
                ) : (
                  <div
                    aria-hidden='true'
                    className='ap-payflow__spinner relative z-10 size-8 animate-spin rounded-full border-2'
                  />
                )}
              </div>
            ) : null}
          </div>
        </ArtistProfilePhoneFrame>
      </div>
    </ArtistProfileSectionShell>
  );
}
