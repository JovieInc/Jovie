'use client';

import { useCallback, useRef, useState } from 'react';
import { BrowserFrame } from './BrowserFrame';
import { ProductDemoCarousel } from './ProductDemoCarousel';

type VideoState = 'loading' | 'playing' | 'error';

export function DemoVideoPlayer({
  videoUrl,
}: {
  readonly videoUrl: string | undefined;
}) {
  const [state, setState] = useState<VideoState>(
    videoUrl ? 'loading' : 'error'
  );
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoadedData = useCallback(() => {
    setState('playing');
  }, []);

  const handleError = useCallback(() => {
    setState('error');
  }, []);

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
          className={`aspect-[1280/720] w-full bg-black object-contain ${
            state === 'loading' ? 'hidden' : ''
          }`}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={handleLoadedData}
          onError={handleError}
        >
          <track
            kind='captions'
            src='/demo/yc-demo.vtt'
            srcLang='en'
            label='English'
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
