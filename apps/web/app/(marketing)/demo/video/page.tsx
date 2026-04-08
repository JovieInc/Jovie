import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoVideoPlayer } from '@/features/demo/DemoVideoPlayer';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Product Demo',
  description:
    'See how Jovie turns every artist profile into a growth engine — in 30 seconds.',
  robots: NOINDEX_ROBOTS,
};

export default function ProductDemoPage() {
  const videoUrl = process.env.DEMO_VIDEO_URL;

  return (
    <section className='mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-16 sm:px-6 lg:py-24'>
      <h1
        className='max-w-2xl text-center text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl'
        style={{ fontFeatureSettings: 'var(--font-features)' }}
      >
        See Jovie in action
      </h1>
      <p className='mt-4 max-w-xl text-center text-lg leading-relaxed text-white/60'>
        From Spotify to your own growth engine — automatically.
      </p>

      <div className='mt-12 w-full sm:mt-16'>
        <DemoVideoPlayer videoUrl={videoUrl} />
      </div>

      <div className='mt-12 flex items-center gap-4'>
        {videoUrl && (
          <a
            href='/api/demo/download'
            className='inline-flex h-12 items-center rounded-full border border-white/20 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10'
            download='jovie-demo.mp4'
          >
            Download Demo
          </a>
        )}
        <Link
          href='/signup'
          className='inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black transition-opacity hover:opacity-90'
        >
          Try it free
        </Link>
      </div>
    </section>
  );
}
