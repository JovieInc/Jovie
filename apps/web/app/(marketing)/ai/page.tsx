import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHeroPhoto } from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import './ai-page.css';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie AI Operating System',
  robots: NOINDEX_ROBOTS,
};

const AI_HERO_INNER_CLASS = 'relative z-3 py-16 sm:py-20 lg:py-24';

const AI_HERO_PHOTO = {
  src: '/images/marketing-hero/ai.webp',
  width: 1600,
  height: 1067,
  opacity: 0.2,
} as const;

export default function AiPage() {
  return (
    <main className='marketing-hero-dock marketing-hero-dock--inset relative overflow-x-clip bg-base text-primary-token'>
      <section className='relative overflow-hidden'>
        <MarketingHeroPhoto {...AI_HERO_PHOTO} />
        <div
          aria-hidden='true'
          className='hero-glow pointer-events-none absolute inset-0'
        />
        <MarketingContainer width='page' className={AI_HERO_INNER_CLASS}>
          <div className='max-w-3xl space-y-5'>
            <p className='text-sm font-medium tracking-tight text-muted-token'>
              Public Brief
            </p>
            <h1
              data-wrap='editorial-title'
              className='ai-hero-title text-4xl font-semibold leading-tight tracking-tight sm:text-5xl'
            >
              {/* ui-casing-allow: marketing display headline */}
              The AI operating system behind every Jovie profile
            </h1>
            <p className='max-w-2xl text-lg leading-8 text-secondary-token'>
              Jovie turns a creator profile into an always-on decision loop:
              identify the visitor, read context, choose the next best action,
              and learn from the result. This public page covers the operating
              model without exposing the private investor portal.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button asChild variant='primary'>
                <Link href={APP_ROUTES.PRICING}>See Pricing</Link>
              </Button>
              <Button asChild variant='secondary'>
                <Link href={APP_ROUTES.SUPPORT}>Contact The Team</Link>
              </Button>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <MarketingContainer
        width='page'
        className='flex flex-col gap-10 pb-16 sm:pb-20 lg:pb-24'
      >
        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>1. Identify</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Recognize known visitors, captured contacts, and anonymous
              browsers with enough signal to personalize the page in real time.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>2. Decide</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Route each visit toward the highest-value next action, whether
              that is listening, subscribing, tipping, merch, or tickets.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>3. Measure</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Capture impressions, clicks, and downstream value events so
              creators can see what turns traffic into real relationships.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>4. Learn</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Use those outcomes to improve routing, segmentation, and follow-up
              automation across future visits.
            </p>
          </article>
        </section>

        <section className='grid gap-8 rounded-4xl border border-subtle bg-panel px-6 py-8 lg:grid-cols-[1.2fr_0.8fr]'>
          <div className='space-y-4'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-2xl font-semibold tracking-tight line-clamp-2'>
              What ships in the launch version
            </h2>
            <ul className='space-y-3 text-sm leading-7 text-secondary-token'>
              <li>
                Adaptive primary CTAs for anonymous versus identified visitors.
              </li>
              <li>Preferred-platform routing for Spotify-first listening.</li>
              <li>
                Signals for subscribe, tip, and repeat-visit intent flows.
              </li>
              <li>
                Instrumentation that ties profile visits to measurable lift.
              </li>
            </ul>
          </div>
          <div className='space-y-4'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-2xl font-semibold tracking-tight line-clamp-2'>
              Read the public context
            </h2>
            <p className='text-sm leading-7 text-secondary-token'>
              The deeper memo and fundraising material stay private. The public
              surfaces below explain the problem, the product shape, and the
              creator-facing offer.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button asChild variant='secondary'>
                <Link href={APP_ROUTES.BLOG_THE_MYSPACE_PROBLEM}>
                  Read The Memo
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </MarketingContainer>

      <MarketingFooterCta
        title='See the AI operating system on your Jovie profile.'
        ctaLabel='See Pricing'
        ctaHref={APP_ROUTES.PRICING}
        ctaAnalyticsEvent='ai_footer_cta_pricing'
        ctaAnalyticsSource='ai_page_footer'
        prefetch={false}
      />
    </main>
  );
}
