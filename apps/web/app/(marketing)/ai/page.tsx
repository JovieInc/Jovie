import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie AI Operating System',
  robots: NOINDEX_ROBOTS,
};

export default function AiPage() {
  return (
    <>
      <MarketingHero variant='left'>
        <p className='marketing-kicker'>Public Brief</p>
        <h1 className='marketing-h1-linear mt-6 max-w-[18ch] text-primary-token'>
          The AI operating system behind every Jovie profile
        </h1>
        <p className='marketing-lead-linear mt-6 max-w-[44rem] text-secondary-token'>
          Jovie turns a creator profile into an always-on decision loop:
          identify the fan, read context, choose the next best action, and learn
          from the result.
        </p>
        <div className='mt-7 flex flex-wrap gap-3'>
          <Link className='public-action-primary' href={APP_ROUTES.PRICING}>
            See Pricing
          </Link>
          <Link className='public-action-secondary' href={APP_ROUTES.SUPPORT}>
            Contact The Team
          </Link>
        </div>
      </MarketingHero>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {[
            {
              title: '1. Identify',
              body: 'Recognize known fans, captured contacts, and anonymous visitors with enough signal to personalize the page in real time.',
            },
            {
              title: '2. Decide',
              body: 'Route each visit toward the highest-value next action, whether that is listening, subscribing, tipping, merch, or tickets.',
            },
            {
              title: '3. Measure',
              body: 'Capture impressions, clicks, and downstream value events so creators can see what turns traffic into real relationships.',
            },
            {
              title: '4. Learn',
              body: 'Use those outcomes to improve routing, segmentation, and follow-up automation across future visits.',
            },
          ].map(item => (
            <article key={item.title} className='homepage-surface-card p-5'>
              <h2 className='text-[1rem] font-semibold tracking-[-0.02em] text-primary-token'>
                {item.title}
              </h2>
              <p className='mt-3 text-sm leading-7 text-secondary-token'>
                {item.body}
              </p>
            </article>
          ))}
        </section>

        <section className='homepage-surface-card mt-6 grid gap-8 p-6 lg:grid-cols-[1.2fr_0.8fr]'>
          <div>
            <h2 className='text-2xl font-semibold tracking-tight text-primary-token'>
              What ships in the launch version
            </h2>
            <ul className='mt-4 space-y-3 text-sm leading-7 text-secondary-token'>
              <li>
                Adaptive primary CTAs for anonymous versus identified fans.
              </li>
              <li>Preferred-platform routing for Spotify-first listening.</li>
              <li>
                Signals for subscribe, tip, release, and tour-intent flows.
              </li>
              <li>
                Instrumentation that ties profile visits to measurable lift.
              </li>
            </ul>
          </div>
          <div>
            <h2 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Read the public context
            </h2>
            <p className='mt-4 text-sm leading-7 text-secondary-token'>
              The deeper memo and fundraising material stay private. The public
              surfaces below explain the problem, the product shape, and the
              creator-facing offer.
            </p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Link
                className='public-action-secondary'
                href={APP_ROUTES.INVESTORS}
              >
                Investor Overview
              </Link>
              <Link
                className='public-action-secondary'
                href={APP_ROUTES.BLOG_THE_MYSPACE_PROBLEM}
              >
                Read The Memo
              </Link>
            </div>
          </div>
        </section>
      </MarketingContainer>
    </>
  );
}
