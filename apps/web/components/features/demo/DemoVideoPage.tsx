import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import {
  DEMO_CAPTIONS_PUBLIC_PATH,
  getDemoVideoDownloadHref,
  getDemoVideoPosterUrl,
  getDemoVideoUrl,
} from '@/lib/demo-video';
import { DemoVideoPlayer } from './DemoVideoPlayer';

export function DemoVideoPage() {
  const videoUrl = getDemoVideoUrl();
  const posterUrl = getDemoVideoPosterUrl();
  const downloadHref = getDemoVideoDownloadHref(videoUrl);

  return (
    <section
      className='mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-16 sm:px-6 lg:py-24'
      data-testid='demo-video-page'
    >
      <h1
        className='max-w-3xl text-center text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl'
        style={{ fontFeatureSettings: 'var(--font-features)' }}
      >
        Jovie turns artist signals into execution
      </h1>

      <div className='mt-10 w-full sm:mt-14'>
        <DemoVideoPlayer
          captionsUrl={DEMO_CAPTIONS_PUBLIC_PATH}
          controls
          label='Jovie demo video'
          posterUrl={posterUrl}
          videoUrl={videoUrl}
        />
      </div>

      <div className='mt-10 flex flex-wrap items-center justify-center gap-4'>
        <a
          href={downloadHref}
          className='inline-flex h-12 items-center rounded-full border border-white/20 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10'
          download='jovie-demo.mp4'
        >
          Download demo
        </a>
        <Button
          asChild
          variant='whitePill'
          className='h-12 px-8 text-sm font-semibold'
        >
          <Link href={APP_ROUTES.SIGNUP}>Try it free</Link>
        </Button>
      </div>
    </section>
  );
}
