/**
 * Marketing recipe compositions — authoritative page-level visual catalog.
 *
 * Dark-only System A/B marketing surfaces; fully static (revalidate = false).
 * Proven recipes use shipped reference route components or product composition paths.
 * Stub recipes are tagged `stub` and optional for taste promotion.
 *
 * @see docs/marketing/AGENT_GUIDE.md
 * @see apps/web/data/marketing/recipes.ts
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Minus } from 'lucide-react';
import Link from 'next/link';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingComparisonChart } from '@/components/features/pricing/PricingComparisonChart';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { ArtistNotificationsLanding } from '@/components/marketing/artist-notifications/ArtistNotificationsLanding';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { HomepageV2Route } from '@/components/marketing/homepage-v2/HomepageV2Route';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { APP_ROUTES } from '@/constants/routes';
import { linktreeComparison } from '@/content/comparisons/linktree';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { MarketingStorySurface } from './story-surface';

// Title must be a string literal so Storybook's static indexer can parse CSF.
const meta: Meta = {
  title: 'Marketing/Recipes',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Proven marketing page recipes. Dark-only; fully static (revalidate = false). Prefer real composition paths (reference route components). Proof sections omit when unverified (zero-proof path).',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

const recipeDocs = (recipeId: string, referenceRoute: string) =>
  [
    `Recipe \`${recipeId}\`. Reference route: \`${referenceRoute}\`.`,
    'Dark-only marketing surface. Fully static (`revalidate = false`).',
    'Mobile viewport companion stories use chromatic disable to protect snapshot budget.',
  ].join(' ');

/** homepage — reference /new via HomepageV2Route */
export const Homepage: Story = {
  name: 'homepage',
  parameters: {
    docs: { description: { story: recipeDocs('homepage', '/new') } },
  },
  render: () => (
    <MarketingStorySurface label='recipe-homepage'>
      <HomepageV2Route />
    </MarketingStorySurface>
  ),
};

export const HomepageMobile: Story = {
  name: 'homepage-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    chromatic: { disable: true },
    docs: { description: { story: 'Mobile viewport of homepage recipe.' } },
  },
  render: Homepage.render,
};

/** pricing — product composition of shipped pricing sections */
export const Pricing: Story = {
  name: 'pricing',
  parameters: {
    docs: { description: { story: recipeDocs('pricing', '/pricing') } },
  },
  render: () => (
    <MarketingStorySurface label='recipe-pricing'>
      <MarketingPageShell className='system-b-pricing-page'>
        <MarketingHero
          className='system-b-pricing-hero'
          headingId='storybook-pricing-hero'
          headline='Pricing'
          subtitle='Artist profiles are free forever. Pro adds the release tools when you need them.'
          primaryCta={{
            label: 'Claim your profile',
            href: `${APP_ROUTES.SIGNUP}?plan=free`,
          }}
          secondaryCta={{
            label: 'Explore Artist Profiles',
            href: APP_ROUTES.ARTIST_PROFILES,
          }}
          logos={false}
        />
        <section aria-label='Plans' className='system-b-pricing-section'>
          <MarketingContainer width='page'>
            <div className='system-b-pricing-plans'>
              <MarketingPricingPlans ctaVariant='secondary' mode='expanded' />
            </div>
          </MarketingContainer>
        </section>
        {/* social-proof omitted: zero-proof (no verified customer quotes on pricing fixtures) */}
        <section
          aria-labelledby='storybook-pricing-compare-heading'
          className='system-b-pricing-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-pricing-section-inner'>
              <div className='system-b-pricing-section-copy'>
                <h2
                  id='storybook-pricing-compare-heading'
                  className='system-b-pricing-section-title'
                >
                  Compare all features
                </h2>
                <p className='system-b-pricing-section-body'>
                  See the plan matrix for notifications, analytics, contacts,
                  smart links, and release workspace capabilities.
                </p>
              </div>
              <div className='system-b-pricing-chart-wrap'>
                <PricingComparisonChart />
              </div>
            </div>
          </MarketingContainer>
        </section>
        <FaqSection
          heading='Pricing FAQ'
          items={[
            {
              question: 'Is the artist profile free?',
              answer:
                'Yes. Artist profiles stay free. Pro unlocks release tools when you need them.',
            },
            {
              question: 'Can I upgrade later?',
              answer:
                'Yes. Claim your profile first, then choose Pro when you want release automation.',
            },
          ]}
        />
        <MarketingFooterCta
          title='Claim your free profile'
          ctaLabel='Get started'
          ctaHref={`${APP_ROUTES.SIGNUP}?plan=free`}
        />
      </MarketingPageShell>
    </MarketingStorySurface>
  ),
};

export const PricingMobile: Story = {
  name: 'pricing-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    chromatic: { disable: true },
  },
  render: Pricing.render,
};

/** artist-lp — shipped ArtistProfileLandingRoute */
export const ArtistLp: Story = {
  name: 'artist-lp',
  parameters: {
    docs: {
      description: { story: recipeDocs('artist-lp', '/artist-profiles') },
    },
  },
  render: () => (
    <MarketingStorySurface label='recipe-artist-lp'>
      <ArtistProfileLandingRoute />
    </MarketingStorySurface>
  ),
};

export const ArtistLpMobile: Story = {
  name: 'artist-lp-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    chromatic: { disable: true },
  },
  render: ArtistLp.render,
};

/** feature — shipped ArtistNotificationsLanding */
export const Feature: Story = {
  name: 'feature',
  parameters: {
    docs: {
      description: {
        story: recipeDocs('feature', '/artist-notifications'),
      },
    },
  },
  render: () => (
    <MarketingStorySurface label='recipe-feature'>
      <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />
    </MarketingStorySurface>
  ),
};

/** comparison — linktree verified comparison data + product section chrome */
export const Comparison: Story = {
  name: 'comparison',
  parameters: {
    docs: {
      description: {
        story: recipeDocs('comparison', '/compare/linktree'),
      },
    },
  },
  render: () => {
    const data = linktreeComparison;
    return (
      <MarketingStorySurface label='recipe-comparison'>
        <PublicPageShell>
          <MarketingHero variant='left'>
            <p className='text-sm font-medium text-tertiary-token'>Compare</p>
            <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
              {data.heroHeadline}
            </h1>
            <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
              {data.heroSubheadline}
            </p>
          </MarketingHero>
          <MarketingContainer width='prose' className='pb-16'>
            <section data-testid='marketing-section-comparison'>
              <h2 className='text-2xl font-semibold text-primary-token'>
                Feature Comparison
              </h2>
              <div className='mt-8 overflow-x-auto'>
                <table className='w-full min-w-md border-collapse text-left text-sm'>
                  <thead>
                    <tr className='border-b border-subtle'>
                      <th className='py-3 pr-4 font-medium text-primary-token'>
                        Feature
                      </th>
                      <th className='py-3 px-4 font-medium text-primary-token'>
                        Jovie
                      </th>
                      <th className='py-3 pl-4 font-medium text-primary-token'>
                        {data.competitor}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map(feature => (
                      <tr
                        key={feature.name}
                        className='border-b border-subtle/60'
                      >
                        <td className='py-3 pr-4 text-secondary-token'>
                          <span className='text-primary-token'>
                            {feature.name}
                          </span>
                          {feature.note ? (
                            <span className='mt-1 block text-xs text-tertiary-token'>
                              {feature.note}
                            </span>
                          ) : null}
                        </td>
                        <td className='py-3 px-4'>
                          {feature.jovie ? (
                            <Check
                              aria-label='Included'
                              className='size-4 text-primary-token'
                            />
                          ) : (
                            <Minus
                              aria-label='Not included'
                              className='size-4 text-tertiary-token'
                            />
                          )}
                        </td>
                        <td className='py-3 pl-4'>
                          {feature.competitor ? (
                            <Check
                              aria-label='Included'
                              className='size-4 text-primary-token'
                            />
                          ) : (
                            <Minus
                              aria-label='Not included'
                              className='size-4 text-tertiary-token'
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className='mt-8 text-sm leading-relaxed text-secondary-token'>
                {data.bottomLine}
              </p>
            </section>
          </MarketingContainer>
          <MarketingContainer width='page' className='pb-8'>
            <div
              className='grid gap-6 sm:grid-cols-3'
              data-testid='marketing-section-feature-grid'
            >
              {[
                {
                  title: 'Smart Links',
                  description:
                    'Route every release to the right streaming destination.',
                },
                {
                  title: 'Fan Capture',
                  description:
                    'Collect contacts when fans land on your profile.',
                },
                {
                  title: 'Release Tools',
                  description:
                    'Notifications and automation when you need them.',
                },
              ].map(item => (
                <div key={item.title}>
                  <h3 className='font-medium text-primary-token'>
                    {item.title}
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </MarketingContainer>
          <FaqSection
            items={data.faq.map(item => ({
              question: item.question,
              answer: item.answer,
            }))}
          />
          <MarketingFooterCta
            title='Try Jovie'
            ctaLabel='Get started'
            ctaHref={APP_ROUTES.SIGNUP}
          />
        </PublicPageShell>
      </MarketingStorySurface>
    );
  },
};

/** launch — product shell + hero + trust + final CTA (full /launch is long-form) */
export const Launch: Story = {
  name: 'launch',
  parameters: {
    docs: {
      description: {
        story: [
          recipeDocs('launch', '/launch'),
          'Story renders the product shell composition of the launch recipe skeleton;',
          'the full long-form route remains the shipped reference.',
        ].join(' '),
      },
    },
  },
  render: () => (
    <MarketingStorySurface label='recipe-launch'>
      <MarketingPageShell>
        <MarketingHero
          headingId='storybook-launch-hero'
          headline='Your entire music career. One intelligent link.'
          subtitle='Import Spotify, create smart links for every release, and turn listeners into fans you own.'
          primaryCta={{
            label: 'Get started',
            href: APP_ROUTES.SIGNUP,
            signUp: true,
          }}
          secondaryCta={{
            label: 'See how it works',
            href: '#how-it-works',
          }}
        />
        <HomeTrustSection presentation='inline-strip' />
        <MarketingContainer width='page' className='py-16'>
          <section
            id='how-it-works'
            data-testid='marketing-section-feature-split'
          >
            <h2 className='text-2xl font-semibold text-primary-token'>
              Why Jovie launches now
            </h2>
            <p className='mt-4 max-w-2xl text-base leading-relaxed text-secondary-token'>
              Independent artists need release infrastructure that captures fans
              and reactivates them — without assembling five tools.
            </p>
          </section>
        </MarketingContainer>
        <MarketingFooterCta
          title='Request access'
          ctaLabel='Get started'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </MarketingPageShell>
    </MarketingStorySurface>
  ),
};

/** seo — about-style hero + prose + FAQ + CTA */
export const Seo: Story = {
  name: 'seo',
  parameters: {
    docs: { description: { story: recipeDocs('seo', '/about') } },
  },
  render: () => (
    <MarketingStorySurface label='recipe-seo'>
      <PublicPageShell>
        <MarketingHero variant='left'>
          <p className='text-sm font-medium text-tertiary-token'>About</p>
          <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
            Release More Music. Do Less Release Work.
          </h1>
          <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
            Jovie is the release platform for independent musicians — smart
            links, artist profiles, audience intelligence, and AI in one place.
          </p>
        </MarketingHero>
        <MarketingContainer width='prose' className='pb-16'>
          <section data-testid='marketing-section-content-prose'>
            <h2 className='text-2xl font-semibold text-primary-token'>
              Why Jovie Exists
            </h2>
            <div className='mt-6 space-y-5 text-base leading-relaxed text-secondary-token'>
              <p>
                Independent artists need marketing infrastructure without a
                label team. Jovie handles the release work so musicians can
                focus on making music.
              </p>
            </div>
          </section>
        </MarketingContainer>
        <FaqSection
          items={[
            {
              question: 'What is Jovie?',
              answer:
                'Jovie is a release platform for independent musicians with smart links, profiles, and fan tools.',
            },
            {
              question: 'Is Jovie free to start?',
              answer:
                'Yes. Artist profiles are free forever. Paid plans unlock release automation.',
            },
          ]}
        />
        <MarketingFooterCta
          title='Get started with Jovie'
          ctaLabel='Get started'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </PublicPageShell>
    </MarketingStorySurface>
  ),
};

/** blog-landing — hero + fixture feed cards (no async filesystem/profile fetch) */
export const BlogLanding: Story = {
  name: 'blog-landing',
  parameters: {
    docs: {
      description: {
        story: [
          recipeDocs('blog-landing', '/blog'),
          'Story uses static fixture posts so Storybook stays free of server blog/profile I/O.',
        ].join(' '),
      },
    },
  },
  render: () => (
    <MarketingStorySurface label='recipe-blog-landing'>
      <PublicPageShell>
        <MarketingHero variant='left'>
          <p className='mb-0 text-sm font-medium text-tertiary-token'>Blog</p>
          <h1 className='mb-6 mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
            Blog
          </h1>
          <p className='max-w-xl text-lg leading-relaxed text-secondary-token'>
            Signals, playbooks, and product notes for independent artists.
          </p>
        </MarketingHero>
        <MarketingContainer width='page' className='pb-16'>
          <section
            className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
            data-testid='marketing-section-blog-feed'
          >
            {[
              {
                title: 'How to claim your artist profile',
                excerpt:
                  'A short playbook for going live with a Jovie profile in under a minute.',
                href: '/blog',
              },
              {
                title: 'Smart links that actually convert',
                excerpt:
                  'Route fans to the right destination without a link-in-bio maze.',
                href: '/blog',
              },
              {
                title: 'Release week checklist',
                excerpt:
                  'Capture, notify, and re-engage fans when the music drops.',
                href: '/blog',
              },
            ].map(post => (
              <article
                key={post.title}
                className='rounded-2xl border border-subtle bg-surface-1 p-6'
              >
                <h2 className='text-lg font-semibold text-primary-token'>
                  <Link href={post.href} className='hover:underline'>
                    {post.title}
                  </Link>
                </h2>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {post.excerpt}
                </p>
              </article>
            ))}
          </section>
        </MarketingContainer>
        <MarketingFooterCta
          title='Build with Jovie'
          ctaLabel='Get started'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </PublicPageShell>
    </MarketingStorySurface>
  ),
};

// ── Stub recipes (optional; behind tags) ─────────────────────────────────────

const stubParameters = {
  docs: { disable: true },
} as const;

function StubRecipeFrame({
  recipeId,
  headline,
}: Readonly<{ recipeId: string; headline: string }>) {
  return (
    <MarketingStorySurface label={`recipe-${recipeId}`}>
      <PublicPageShell>
        <MarketingHero
          headingId={`storybook-${recipeId}-hero`}
          headline={headline}
          subtitle='Stub recipe — order + arc only. First ship requires human taste (DX2).'
          primaryCta={{ label: 'Talk to us', href: APP_ROUTES.SIGNUP }}
          logos={false}
        />
        <MarketingFooterCta
          title={headline}
          ctaLabel='Talk to us'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </PublicPageShell>
    </MarketingStorySurface>
  );
}

export const AgencyLp: Story = {
  name: 'agency-lp',
  tags: ['stub'],
  parameters: stubParameters,
  render: () => (
    <StubRecipeFrame
      recipeId='agency-lp'
      headline='Jovie for agencies managing multiple artists'
    />
  ),
};

export const Enterprise: Story = {
  name: 'enterprise',
  tags: ['stub'],
  parameters: stubParameters,
  render: () => (
    <StubRecipeFrame
      recipeId='enterprise'
      headline='Jovie at enterprise scale'
    />
  ),
};

export const Waitlist: Story = {
  name: 'waitlist',
  tags: ['stub'],
  parameters: stubParameters,
  render: () => (
    <StubRecipeFrame
      recipeId='waitlist'
      headline='Join the Jovie waitlist for early access'
    />
  ),
};
