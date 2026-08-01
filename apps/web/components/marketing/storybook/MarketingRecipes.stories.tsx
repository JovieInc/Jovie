import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Minus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { ArtistNotificationsLanding } from '@/components/marketing/artist-notifications/ArtistNotificationsLanding';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { HomepageV2Route } from '@/components/marketing/homepage-v2/HomepageV2Route';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { APP_ROUTES } from '@/constants/routes';
import { getComparison } from '@/content/comparisons';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { MARKETING_RECIPES, type RecipeId } from '@/data/marketing';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { STORY_BLOG_POSTS, STORY_FAQ_ITEMS } from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
  recipeViewports,
} from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

/**
 * Proven marketing recipe page compositions.
 * Storybook titles: Marketing/Recipes/<recipeId>
 *
 * Prefer shipped reference route components (or the same primitives those
 * routes compose). Stub recipes are tagged `stub` + docs.disable.
 */
const meta = {
  title: 'Marketing/Recipes',
  parameters: {
    ...marketingFullscreenParameters,
    viewport: {
      viewports: recipeViewports,
      defaultViewport: 'desktop',
    },
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Each story is a proven recipe composition from the marketing registry.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function RecipeChrome({
  recipeId,
  children,
}: Readonly<{ recipeId: RecipeId; children: ReactNode }>) {
  const recipe = MARKETING_RECIPES.find(r => r.id === recipeId);
  return (
    <div
      data-testid={`marketing-recipe-${recipeId}`}
      data-recipe-status={recipe?.status ?? 'unknown'}
      className='bg-base text-primary-token'
    >
      {children}
    </div>
  );
}

export const homepage: Story = {
  name: 'homepage',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `homepage` — reference route `/new` via HomepageV2Route.',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='homepage'>
      <PublicPageShell>
        <HomepageV2Route />
      </PublicPageShell>
    </RecipeChrome>
  ),
};

/** Mobile viewport companion — chromatic disabled to protect snapshot budget. */
export const homepageMobile: Story = {
  name: 'homepage-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { disable: true },
    docs: { description: { story: 'Mobile viewport of homepage recipe.' } },
  },
  render: homepage.render,
};

export const pricing: Story = {
  name: 'pricing',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `pricing` — reference route `/pricing` composition (hero + plans + comparison + close).',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='pricing'>
      <PublicPageShell>
        <MarketingPageShell className='system-b-pricing-page'>
          <MarketingHero
            className='system-b-pricing-hero'
            headingId='pricing-hero-heading-story'
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

          <section
            aria-labelledby='pricing-compare-heading-story'
            className='system-b-pricing-section'
          >
            <MarketingContainer width='page'>
              <div className='system-b-pricing-section-inner'>
                <div className='system-b-pricing-section-copy'>
                  <h2
                    id='pricing-compare-heading-story'
                    className='system-b-pricing-section-title'
                  >
                    Compare All Features
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

          <MarketingFinalCTA
            title='Get Started'
            body='Claim the profile first. Choose Pro when you want the release system turned on.'
            ctaLabel='Claim your profile'
            ctaHref={`${APP_ROUTES.SIGNUP}?plan=free`}
          />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
  ),
};

export const pricingMobile: Story = {
  name: 'pricing-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { disable: true },
  },
  render: pricing.render,
};

export const artistLp: Story = {
  name: 'artist-lp',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `artist-lp` — reference route `/artist-profiles` via ArtistProfileLandingRoute.',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='artist-lp'>
      <PublicPageShell>
        <ArtistProfileLandingRoute />
      </PublicPageShell>
    </RecipeChrome>
  ),
};

export const artistLpMobile: Story = {
  name: 'artist-lp-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { disable: true },
  },
  render: artistLp.render,
};

export const feature: Story = {
  name: 'feature',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `feature` — reference route `/artist-notifications` via ArtistNotificationsLanding.',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='feature'>
      <PublicPageShell>
        <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />
      </PublicPageShell>
    </RecipeChrome>
  ),
};

export const comparison: Story = {
  name: 'comparison',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `comparison` — reference `/compare/linktree` using shipped comparison data + FaqSection.',
      },
    },
  },
  render: () => {
    const data = getComparison('linktree');
    if (!data) {
      return (
        <RecipeChrome recipeId='comparison'>
          <p className='p-8 text-secondary-token'>Comparison data missing.</p>
        </RecipeChrome>
      );
    }

    return (
      <RecipeChrome recipeId='comparison'>
        <PublicPageShell>
          <MarketingPageShell>
            <MarketingHero
              headingId='comparison-hero-heading'
              headline={data.heroHeadline}
              subtitle={data.heroSubheadline}
              primaryCta={{
                label: 'Get started',
                href: APP_ROUTES.SIGNUP,
              }}
              logos={false}
            />

            <section
              aria-labelledby='comparison-matrix-heading'
              className='py-16'
              data-testid='marketing-section-comparison'
            >
              <MarketingContainer width='page'>
                <h2
                  id='comparison-matrix-heading'
                  className='text-2xl font-semibold text-primary-token'
                >
                  Feature Matrix
                </h2>
                <div className='mt-8 overflow-x-auto'>
                  <table className='w-full min-w-160 border-collapse text-left text-sm'>
                    <thead>
                      <tr className='border-b border-subtle'>
                        <th className='py-3 pr-4 font-medium text-secondary-token'>
                          Capability
                        </th>
                        <th className='py-3 pr-4 font-medium text-primary-token'>
                          Jovie
                        </th>
                        <th className='py-3 font-medium text-secondary-token'>
                          {data.competitor}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.features.map(row => (
                        <tr key={row.name} className='border-b border-subtle'>
                          <th
                            scope='row'
                            className='py-3 pr-4 font-normal text-primary-token'
                          >
                            {row.name}
                            {row.note ? (
                              <span className='mt-1 block text-xs text-tertiary-token'>
                                {row.note}
                              </span>
                            ) : null}
                          </th>
                          <td className='py-3 pr-4'>
                            {row.jovie ? (
                              <Check
                                className='h-4 w-4 text-accent-green'
                                aria-label='Yes'
                              />
                            ) : (
                              <Minus
                                className='h-4 w-4 text-tertiary-token'
                                aria-label='No'
                              />
                            )}
                          </td>
                          <td className='py-3'>
                            {row.competitor ? (
                              <Check
                                className='h-4 w-4 text-secondary-token'
                                aria-label='Yes'
                              />
                            ) : (
                              <Minus
                                className='h-4 w-4 text-tertiary-token'
                                aria-label='No'
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MarketingContainer>
            </section>

            <FaqSection items={data.faq ?? [...STORY_FAQ_ITEMS]} />
            <MarketingFinalCTA />
          </MarketingPageShell>
        </PublicPageShell>
      </RecipeChrome>
    );
  },
};

export const launch: Story = {
  name: 'launch',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `launch` — thin product composition mirroring `/launch` grammar (hero + feature beats + close). Full long-form narrative stays on the route.',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='launch'>
      <PublicPageShell>
        <MarketingPageShell>
          <MarketingHero
            headingId='launch-hero-heading'
            headline='Your Entire Music Career. One Intelligent Link.'
            subtitle='Jovie launches the release system independent artists use to capture every fan and reactivate them automatically.'
            primaryCta={{ label: 'Get started', href: APP_ROUTES.SIGNUP }}
            logos={false}
          />
          <section
            className='py-16'
            data-testid='marketing-section-feature-split'
          >
            <MarketingContainer width='page'>
              <h2 className='text-2xl font-semibold text-primary-token'>
                One Profile For Every Drop
              </h2>
              <p className='mt-4 max-w-prose text-secondary-token'>
                Adaptive artist profiles, smart links, deeplinks, and fan
                notifications — the launch narrative on `/launch` expands each
                beat; this story holds the recipe shell for visual QA.
              </p>
            </MarketingContainer>
          </section>
          <MarketingFinalCTA
            title='Get Started'
            ctaLabel='Get started'
            ctaHref={APP_ROUTES.SIGNUP}
          />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
  ),
};

export const seo: Story = {
  name: 'seo',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `seo` — reference `/about` grammar (hero + FAQ + close). FAQPage schema lives on the route.',
      },
    },
  },
  render: () => (
    <RecipeChrome recipeId='seo'>
      <PublicPageShell>
        <MarketingPageShell>
          <MarketingHero
            headingId='seo-hero-heading'
            headline='About Jovie'
            subtitle='Jovie is a release platform for independent musicians — smart links, artist profiles, audience intelligence, and release automation.'
            primaryCta={{ label: 'Get started', href: APP_ROUTES.SIGNUP }}
            logos={false}
            align='left'
          />
          <FaqSection items={[...STORY_FAQ_ITEMS]} />
          <MarketingFinalCTA />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
  ),
};

export const blogLanding: Story = {
  name: 'blog-landing',
  parameters: {
    docs: {
      description: {
        story:
          'Proven recipe `blog-landing` — reference `/blog` using StoryBlogCard fixtures (no filesystem/network fetch in Storybook).',
      },
    },
  },
  render: () => {
    const [featured, ...rest] = STORY_BLOG_POSTS;
    return (
      <RecipeChrome recipeId='blog-landing'>
        <PublicPageShell>
          <MarketingPageShell>
            <MarketingHero variant='left'>
              <MarketingContainer width='page'>
                <h1 className='text-4xl font-semibold tracking-tight text-primary-token'>
                  Blog
                </h1>
                <p className='mt-4 max-w-prose text-lg text-secondary-token'>
                  Signals, playbooks, and product notes for building lasting
                  momentum as an independent artist.
                </p>
              </MarketingContainer>
            </MarketingHero>

            <section
              className='py-12'
              data-testid='marketing-section-blog-feed'
            >
              <MarketingContainer width='page'>
                {featured ? (
                  <StoryBlogCard post={featured} variant='featured' />
                ) : null}
                <div className='mt-8 grid gap-6 md:grid-cols-2'>
                  {rest.map(post => (
                    <StoryBlogCard key={post.slug} post={post} />
                  ))}
                </div>
              </MarketingContainer>
            </section>

            <MarketingFinalCTA
              title='Stay In The Loop'
              body='Claim a profile when you are ready to put the playbooks into practice.'
            />
          </MarketingPageShell>
        </PublicPageShell>
      </RecipeChrome>
    );
  },
};

function StubRecipeStory({
  recipeId,
}: Readonly<{
  recipeId: Extract<RecipeId, 'agency-lp' | 'enterprise' | 'waitlist'>;
}>) {
  const recipe = MARKETING_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return null;
  return (
    <RecipeChrome recipeId={recipeId}>
      <PublicPageShell>
        <MarketingPageShell>
          <MarketingContainer width='page' className='py-16'>
            <p className='text-xs font-medium uppercase tracking-wide text-tertiary-token'>
              Stub Recipe · {recipe.status}
            </p>
            <h1 className='mt-3 text-3xl font-semibold text-primary-token'>
              {recipe.label}
            </h1>
            <p className='mt-4 max-w-prose text-secondary-token'>
              {recipe.hierarchy.oneBigIdea} First implementation goes through
              human taste feedback before promoting to proven.
            </p>
            <ol className='mt-8 list-decimal space-y-2 pl-5 text-sm text-secondary-token'>
              {(() => {
                const occurrence: Partial<Record<string, number>> = {};
                return recipe.sectionOrder.map(sectionId => {
                  const n = (occurrence[sectionId] ?? 0) + 1;
                  occurrence[sectionId] = n;
                  return (
                    <li key={`${sectionId}#${n}`}>
                      <code className='text-primary-token'>{sectionId}</code>
                    </li>
                  );
                });
              })()}
            </ol>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='mt-10 inline-flex text-sm font-medium text-primary-token underline-offset-4 hover:underline'
            >
              {recipe.ctaCadence.primaryLabel}
            </Link>
          </MarketingContainer>
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
  );
}

export const agencyLp: Story = {
  name: 'agency-lp',
  tags: ['stub'],
  parameters: {
    docs: { disable: true },
  },
  render: () => <StubRecipeStory recipeId='agency-lp' />,
};

export const enterprise: Story = {
  name: 'enterprise',
  tags: ['stub'],
  parameters: {
    docs: { disable: true },
  },
  render: () => <StubRecipeStory recipeId='enterprise' />,
};

export const waitlist: Story = {
  name: 'waitlist',
  tags: ['stub'],
  parameters: {
    docs: { disable: true },
  },
  render: () => <StubRecipeStory recipeId='waitlist' />,
};
