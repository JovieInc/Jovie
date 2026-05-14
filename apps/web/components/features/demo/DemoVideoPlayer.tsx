'use client';

import { useCallback, useState } from 'react';
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
  const handleError = useCallback(() => {
    setState('error');
  }, []);

  // No video URL configured — show carousel directly
  if (!videoUrl) {
    return <ProductDemoCarousel />;
  }

  return (
    <BrowserFrame>
      {state !== 'error' && (
        <video
          aria-label={label}
          className='aspect-[1280/720] w-full bg-black object-contain'
          src={videoUrl}
          poster={posterUrl}
          controls={controls}
          playsInline
          preload='auto'
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
