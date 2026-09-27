import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHeroPhoto } from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Investor Overview',
  robots: NOINDEX_ROBOTS,
};

const INVESTORS_HERO_PHOTO = {
  src: '/images/marketing-hero/investors.webp',
  width: 1600,
  height: 901,
} as const;

export default function InvestorsPage() {
  return (
    <main className='marketing-hero-dock marketing-hero-dock--inset relative overflow-x-clip bg-base text-primary-token'>
      <section className='relative overflow-hidden'>
        <MarketingHeroPhoto {...INVESTORS_HERO_PHOTO} />
        <div
          aria-hidden='true'
          className='hero-glow pointer-events-none absolute inset-0'
        />
        <MarketingContainer
          width='page'
          className='relative z-3 py-16 sm:py-20 lg:py-24'
        >
          <div className='max-w-3xl space-y-5'>
            <p className='text-sm font-medium tracking-tight text-muted-token'>
              Investor overview
            </p>
            {/* ui-casing-allow: marketing display headline */}
            <h1 className='text-4xl font-semibold tracking-tight line-clamp-2 sm:text-5xl'>
              Jovie turns creator traffic into measurable audience value
            </h1>
            <p className='max-w-2xl text-lg leading-8 text-secondary-token'>
              The private investor portal stays token-gated. This public page is
              a high-level overview of the product thesis: capture the audience,
              personalize the next action, and compound audience relationships
              from the first profile visit onward.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button asChild variant='primary'>
                <Link href={APP_ROUTES.SUPPORT} prefetch={false}>
                  Request Access
                </Link>
              </Button>
              <Button asChild variant='secondary'>
                <Link href={APP_ROUTES.AI} prefetch={false}>
                  Read The AI Brief
                </Link>
              </Button>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <MarketingContainer
        width='page'
        className='flex flex-col gap-10 pb-16 sm:pb-20 lg:pb-24'
      >
        <section className='grid gap-4 md:grid-cols-3'>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>
              Traffic choke point
            </h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Every marketing push already ends at the profile. Jovie upgrades
              that page from a static link list into an adaptive funnel.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>
              Compounding data asset
            </h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Each click and capture event improves the next routing decision,
              creating a system that gets smarter as creator traffic grows.
            </p>
          </article>
          <article className='rounded-3xl border border-subtle bg-panel px-5 py-6'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-lg font-semibold line-clamp-2'>
              Revenue paths
            </h2>
            <p className='mt-3 text-sm leading-7 text-secondary-token'>
              Launch routes cover subscription growth, listening conversion,
              tipping, promo downloads, and context-aware release promotion.
            </p>
          </article>
        </section>

        <section className='grid gap-8 rounded-4xl border border-subtle bg-panel px-6 py-8 lg:grid-cols-[0.95fr_1.05fr]'>
          <div className='space-y-4'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-2xl font-semibold tracking-tight line-clamp-2'>
              Why now
            </h2>
            <p className='text-sm leading-7 text-secondary-token'>
              Content creation is cheap, distribution is crowded, and static
              link-in-bio tooling does not adapt to audience context. Jovie sits
              at the first-party surface where creators already own attention.
            </p>
          </div>
          <div className='space-y-4'>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='text-2xl font-semibold tracking-tight line-clamp-2'>
              Public materials
            </h2>
            <p className='text-sm leading-7 text-secondary-token'>
              The full deck and detailed fundraising materials remain private.
              These public links cover the product logic and launch-ready
              creator experience without exposing gated investor data.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button asChild variant='secondary'>
                <Link
                  href={APP_ROUTES.BLOG_THE_CONTACT_PROBLEM}
                  prefetch={false}
                >
                  Read The Thesis
                </Link>
              </Button>
              <Button asChild variant='secondary'>
                <Link href={APP_ROUTES.PRICING} prefetch={false}>
                  View Product Pricing
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </MarketingContainer>

      <MarketingFooterCta
        title='Request access to the investor overview.'
        ctaLabel='Request Access'
        ctaHref={APP_ROUTES.SUPPORT}
        ctaAnalyticsEvent='investors_footer_cta_request_access'
        ctaAnalyticsSource='investors_page_footer'
        prefetch={false}
      />
    </main>
  );
}
