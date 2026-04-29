import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
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
    <>
      <MarketingHero variant='centered'>
        <h1 className='marketing-h1-linear max-w-[14ch] text-primary-token'>
          See Jovie in action
        </h1>
        <p className='marketing-lead-linear mt-5 max-w-xl text-secondary-token'>
          From Spotify to your own growth engine, automatically.
        </p>
      </MarketingHero>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='mx-auto max-w-5xl'>
          <DemoVideoPlayer videoUrl={videoUrl} />
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            {videoUrl ? (
              <a
                href='/api/demo/download'
                className='public-action-secondary'
                download='jovie-demo.mp4'
              >
                Download Demo
              </a>
            ) : null}
            <Link href={APP_ROUTES.SIGNUP} className='public-action-primary'>
              Try It Free
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </>
  );
}
