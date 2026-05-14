'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserFrame } from './BrowserFrame';
import { ProductDemoCarousel } from './ProductDemoCarousel';

type VideoState = 'loading' | 'playing' | 'error';

export function DemoVideoPlayer({
  videoUrl,
  captionsUrl = '/demo/jovie-demo.vtt',
  posterUrl,
  controls = false,
  label = 'Jovie demo video',
}: {
  readonly videoUrl: string | undefined;
  readonly captionsUrl?: string;
  readonly posterUrl?: string;
  readonly controls?: boolean;
  readonly label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoState>(
    videoUrl ? 'loading' : 'error'
  );
  const handleLoadedData = useCallback(() => {
    setState('playing');
  }, []);

  const handleError = useCallback(() => {
    setState('error');
  }, []);

  useEffect(() => {
    setState(videoUrl ? 'loading' : 'error');
  }, [videoUrl]);

  useEffect(() => {
    if (!(videoUrl && state === 'loading')) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setState('playing');
      return;
    }

    const pollId = window.setInterval(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        setState('playing');
        window.clearInterval(pollId);
      }
    }, 250);

    return () => {
      window.clearInterval(pollId);
    };
  }, [state, videoUrl]);

  // No video URL configured — show carousel directly
  if (!videoUrl) {
    return <ProductDemoCarousel />;
  }

  return (
    <BrowserFrame>
      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className='flex aspect-[1280/720] w-full items-center justify-center bg-black'>
          <div className='flex flex-col items-center gap-3'>
            <div className='size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80' />
            <p className='text-sm text-white/40'>Loading demo...</p>
          </div>
        </div>
      )}

      {/* Video player */}
      {state !== 'error' && (
        <video
          ref={videoRef}
          aria-label={label}
          className={`aspect-[1280/720] w-full bg-black object-contain ${
            state === 'loading' ? 'hidden' : ''
          }`}
          src={videoUrl}
          poster={posterUrl}
          controls={controls}
          muted
          loop
          playsInline
          preload='auto'
          onLoadedMetadata={handleLoadedData}
          onLoadedData={handleLoadedData}
          onCanPlay={handleLoadedData}
          onError={handleError}
        >
          <track
            kind='captions'
            src={captionsUrl}
            srcLang='en'
            label='English'
            default
          />
        </video>
      )}

      {/* Error fallback — show carousel */}
      {state === 'error' && (
        <div className='w-full'>
          <ProductDemoCarousel />
        </div>
      )}
    </BrowserFrame>
  );
}
