import type { Metadata } from 'next';
import Link from 'next/link';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Investor Overview',
  robots: NOINDEX_ROBOTS,
};

export default function InvestorsPage() {
  return (
    <main className='bg-base px-6 py-16 text-primary-token sm:px-8 lg:px-12'>
      <div className='mx-auto flex max-w-5xl flex-col gap-10'>
        <section className='max-w-3xl space-y-5'>
          <p className='text-sm font-medium uppercase tracking-[0.18em] text-muted-token'>
            Investor Overview
          </p>
          <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl'>
            Jovie turns creator traffic into measurable fan value
          </h1>
          <p className='max-w-2xl text-lg leading-8 text-secondary-token'>
            The private investor portal stays token-gated. This public page is a
            high-level overview of the product thesis: capture the audience,
            personalize the next action, and compound fan relationships from the
            first profile visit onward.
          </p>
          <div className='flex flex-wrap gap-3'>
            <Link className='btn-linear-primary' href='/support'>
              Request Access
            </Link>
            <Link className='btn-linear-secondary' href='/ai'>
              Read The AI Brief
            </Link>
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-3'>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>Traffic choke point</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Every marketing push already ends at the profile. Jovie upgrades
              that page from a static link list into an adaptive funnel.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>Compounding data asset</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Each click and capture event improves the next routing decision,
              creating a system that gets smarter as creator traffic grows.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            <h2 className='text-lg font-semibold'>Revenue paths</h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Launch routes cover subscription growth, listening conversion,
              tipping, promo downloads, and context-aware release promotion.
            </p>
          </article>
        </section>

        <section className='grid gap-8 rounded-[2rem] border border-subtle bg-panel px-6 py-8 lg:grid-cols-[0.95fr_1.05fr]'>
          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold tracking-tight'>Why now</h2>
            <p className='text-sm leading-7 text-secondary-token'>
              Music creation is cheap, distribution is crowded, and static
              link-in-bio tooling does not adapt to fan context. Jovie sits at
              the first-party surface where creators already own attention.
            </p>
          </div>
          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold tracking-tight'>
              Public materials
            </h2>
            <p className='text-sm leading-7 text-secondary-token'>
              The full deck and detailed fundraising materials remain private.
              These public links cover the product logic and launch-ready
              creator experience without exposing gated investor data.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Link
                className='btn-linear-secondary'
                href='/blog/the-contact-problem'
              >
                Read The Thesis
              </Link>
              <Link className='btn-linear-secondary' href='/pricing'>
                View Product Pricing
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
