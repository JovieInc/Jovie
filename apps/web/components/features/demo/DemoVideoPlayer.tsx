'use client';

import { Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';
import { BrowserFrame } from './BrowserFrame';
import { ProductDemoCarousel } from './ProductDemoCarousel';

type VideoState = 'ready' | 'error';

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
  const [state, setState] = useState<VideoState>(videoUrl ? 'ready' : 'error');
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleError = useCallback(() => {
    setState('error');
  }, []);
  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    void video
      .play()
      .then(() => {
        setHasStarted(true);
      })
      .catch(() => {
        // Keep the custom CTA available so the user can retry playback.
        setHasStarted(false);
      });
  }, []);

  // No video URL configured — show carousel directly
  if (!videoUrl) {
    return <ProductDemoCarousel />;
  }

  return (
    <BrowserFrame>
      {state !== 'error' && (
        <div
          className='relative aspect-[1280/720] w-full overflow-hidden bg-black'
          data-testid='demo-video-visual'
        >
          {posterUrl ? (
            <Image
              alt=''
              aria-hidden='true'
              className='object-cover'
              data-testid='demo-video-poster'
              fill
              priority
              sizes='1280px'
              src={posterUrl}
              unoptimized
            />
          ) : null}
          <video
            aria-label={label}
            className={`relative z-10 aspect-[1280/720] w-full bg-transparent object-contain transition-opacity duration-subtle ${
              hasStarted ? 'opacity-100' : 'opacity-0'
            }`}
            controls={controls}
            onError={handleError}
            onPlay={() => setHasStarted(true)}
            playsInline
            poster={posterUrl}
            preload='none'
            ref={videoRef}
            src={videoUrl}
          >
            <track
              kind='captions'
              src={captionsUrl}
              srcLang='en'
              label='English'
              default
            />
          </video>
          {!hasStarted && posterUrl ? (
            <button
              type='button'
              aria-label='Play Jovie demo video'
              className='absolute left-1/2 top-1/2 z-20 inline-flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-2xl shadow-black/40 transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black'
              onClick={handlePlay}
            >
              <Play aria-hidden='true' className='ml-1 size-7 fill-current' />
            </button>
          ) : null}
        </div>
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
