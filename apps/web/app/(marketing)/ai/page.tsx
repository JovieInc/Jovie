import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie AI Operating System',
  robots: NOINDEX_ROBOTS,
};

export default function AiPage() {
  return (
    <main className='bg-base px-6 py-16 text-primary-token sm:px-8 lg:px-12'>
      <div className='mx-auto flex max-w-5xl flex-col gap-10'>
        <section className='max-w-3xl space-y-5'>
          <p className='text-sm font-medium tracking-tight text-muted-token'>
            Public Brief
          </p>
          <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl'>
            The AI operating system behind every Jovie profile
          </h1>
          <p className='max-w-2xl text-lg leading-8 text-secondary-token'>
            Jovie turns a creator profile into an always-on decision loop:
            identify the fan, read context, choose the next best action, and
            learn from the result. This public page covers the operating model
            without exposing the private investor portal.
          </p>
          <div className='flex flex-wrap gap-3'>
            <Link className='btn-linear-primary' href={APP_ROUTES.PRICING}>
              See Pricing
            </Link>
            <Link className='btn-linear-secondary' href={APP_ROUTES.SUPPORT}>
              Contact The Team
            </Link>
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>1. Identify</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Recognize known fans, captured contacts, and anonymous visitors
              with enough signal to personalize the page in real time.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>2. Decide</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Route each visit toward the highest-value next action, whether
              that is listening, subscribing, tipping, merch, or tickets.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>3. Measure</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Capture impressions, clicks, and downstream value events so
              creators can see what turns traffic into real relationships.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>4. Learn</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Use those outcomes to improve routing, segmentation, and follow-up
              automation across future visits.
            </p>
          </article>
        </section>

        <section className='grid gap-8 rounded-[2rem] border border-subtle bg-panel px-6 py-8 lg:grid-cols-[1.2fr_0.8fr]'>
          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold tracking-tight'>
              What ships in the launch version
            </h2>
            <ul className='space-y-3 text-sm leading-7 text-secondary-token'>
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
          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold tracking-tight'>
              Read the public context
            </h2>
            <p className='text-sm leading-7 text-secondary-token'>
              The deeper memo and fundraising material stay private. The public
              surfaces below explain the problem, the product shape, and the
              creator-facing offer.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Link
                className='btn-linear-secondary'
                href={APP_ROUTES.INVESTORS}
              >
                Investor Overview
              </Link>
              <Link
                className='btn-linear-secondary'
                href={APP_ROUTES.BLOG_THE_MYSPACE_PROBLEM}
              >
                Read The Memo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
