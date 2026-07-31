/**
 * Marketing section catalog — one composition story per MARKETING_SECTION_IDS entry.
 *
 * Uses registry `component` paths when importable. WIP/TBD/zero-proof gaps are
 * tagged `wip` and render a documented gap panel (never silently omitted).
 *
 * @see apps/web/data/marketing/sections.ts
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Minus } from 'lucide-react';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import {
  FaqSection,
  MarketingContainer,
  MarketingContentShell,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { ArtistProfileCaptureSection } from '@/components/marketing/artist-profile/ArtistProfileCaptureSection';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from '@/components/marketing/artist-profile/ArtistProfileHowItWorks';
import { ArtistProfileMonetizationSection } from '@/components/marketing/artist-profile/ArtistProfileMonetizationSection';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ArtistProfileSocialProof } from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';
import { linktreeComparison } from '@/content/comparisons/linktree';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { getMarketingSection } from '@/data/marketing';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import {
  MarketingSectionGapPanel,
  MarketingStorySurface,
} from './story-surface';

// Title must be a string literal so Storybook's static indexer can parse CSF.
const meta: Meta = {
  title: 'Marketing/Sections',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'One story per marketing section id from the registry. Dark-only; fully static. Proof sections omit when unverified.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

const sectionDocs = (sectionId: string) => {
  const section = getMarketingSection(
    sectionId as Parameters<typeof getMarketingSection>[0]
  );
  return [
    `Section \`${sectionId}\` (${section.label}).`,
    `Registry component: \`${section.component}\`.`,
    'Dark-only. Fully static (`revalidate = false`).',
  ].join(' ');
};

/** hero — MarketingHero content mode */
export const Hero: Story = {
  name: 'hero',
  parameters: {
    docs: { description: { story: sectionDocs('hero') } },
  },
  render: () => (
    <MarketingStorySurface label='section-hero'>
      <MarketingPageShell>
        <MarketingHero
          headingId='storybook-section-hero'
          headline='One profile that captures every fan'
          subtitle='Claim your handle, route streams, and own the relationship.'
          primaryCta={{
            label: 'Claim your Jovie',
            href: APP_ROUTES.SIGNUP,
            signUp: true,
          }}
          secondaryCta={{
            label: 'See a live profile',
            href: APP_ROUTES.ARTIST_PROFILES,
          }}
          testId='marketing-section-hero'
        />
      </MarketingPageShell>
    </MarketingStorySurface>
  ),
};

/** logo-cloud — HomeTrustSection */
export const LogoCloud: Story = {
  name: 'logo-cloud',
  parameters: {
    docs: { description: { story: sectionDocs('logo-cloud') } },
  },
  render: () => (
    <MarketingStorySurface label='section-logo-cloud'>
      <div data-testid='marketing-section-logo-cloud'>
        <HomeTrustSection presentation='inline-strip' />
      </div>
    </MarketingStorySurface>
  ),
};

/** feature-grid — ArtistProfileOutcomesCarousel (registry) */
export const FeatureGrid: Story = {
  name: 'feature-grid',
  parameters: {
    docs: { description: { story: sectionDocs('feature-grid') } },
  },
  render: () => (
    <MarketingStorySurface label='section-feature-grid'>
      <div data-testid='marketing-section-feature-grid'>
        <ArtistProfileOutcomesCarousel
          outcomes={ARTIST_PROFILE_COPY.outcomes}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/**
 * feature-split — registry points at ArtistProfileAdaptiveIntro;
 * shipped path is ArtistProfileHeroAdaptiveIntro (hero + adaptive).
 */
export const FeatureSplit: Story = {
  name: 'feature-split',
  parameters: {
    docs: { description: { story: sectionDocs('feature-split') } },
  },
  render: () => (
    <MarketingStorySurface label='section-feature-split'>
      <div data-testid='marketing-section-feature-split'>
        <ArtistProfileHeroAdaptiveIntro
          hero={ARTIST_PROFILE_COPY.hero}
          adaptive={ARTIST_PROFILE_COPY.adaptive}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/** how-it-works */
export const HowItWorks: Story = {
  name: 'how-it-works',
  parameters: {
    docs: { description: { story: sectionDocs('how-it-works') } },
  },
  render: () => (
    <MarketingStorySurface label='section-how-it-works'>
      <div data-testid='marketing-section-how-it-works'>
        <ArtistProfileHowItWorks howItWorks={ARTIST_PROFILE_COPY.howItWorks} />
      </div>
    </MarketingStorySurface>
  ),
};

/**
 * social-proof — real component; returns null when quotes unverified (zero-proof).
 * Story still mounts the product path and documents omit state.
 */
export const SocialProof: Story = {
  name: 'social-proof',
  parameters: {
    docs: {
      description: {
        story: [
          sectionDocs('social-proof'),
          ARTIST_PROFILE_SOCIAL_PROOF.hasRealQuotes
            ? 'Verified quotes present.'
            : 'Zero-proof: component omits content when hasRealQuotes is false.',
        ].join(' '),
      },
    },
  },
  render: () => (
    <MarketingStorySurface label='section-social-proof'>
      <div data-testid='marketing-section-social-proof'>
        <ArtistProfileSocialProof
          socialProof={ARTIST_PROFILE_COPY.socialProof}
          proofData={ARTIST_PROFILE_SOCIAL_PROOF}
        />
        {!ARTIST_PROFILE_SOCIAL_PROOF.hasRealQuotes ? (
          <MarketingContainer width='page' className='py-12'>
            <p className='text-sm text-tertiary-token'>
              Social proof omitted — no verified quotes in fixture data
              (zero-proof path).
            </p>
          </MarketingContainer>
        ) : null}
      </div>
    </MarketingStorySurface>
  ),
};

/**
 * stats — registry points at HomeStatQuoteSection which defaults to fabricated
 * metrics. Zero-proof path: omit product render; gap panel is the story.
 */
export const Stats: Story = {
  name: 'stats',
  tags: ['wip'],
  parameters: {
    docs: { description: { story: sectionDocs('stats') } },
  },
  render: () => (
    <MarketingSectionGapPanel
      sectionId='stats'
      componentPath={getMarketingSection('stats').component}
      reason='Zero-proof path: HomeStatQuoteSection defaults invent metrics. Do not render fabricated stats in Storybook; ship only with verified, attributable figures.'
    />
  ),
};

/** pricing — MarketingPricingPlans */
export const Pricing: Story = {
  name: 'pricing',
  parameters: {
    docs: { description: { story: sectionDocs('pricing') } },
  },
  render: () => (
    <MarketingStorySurface label='section-pricing'>
      <MarketingContainer width='page' className='py-16'>
        <div data-testid='marketing-section-pricing'>
          <MarketingPricingPlans ctaVariant='secondary' mode='expanded' />
        </div>
      </MarketingContainer>
    </MarketingStorySurface>
  ),
};

/**
 * comparison — data-driven from content/comparisons (registry notes render TBD).
 * Story composes verified linktree comparison rows with product chrome.
 */
export const Comparison: Story = {
  name: 'comparison',
  tags: ['wip'],
  parameters: {
    docs: { description: { story: sectionDocs('comparison') } },
  },
  render: () => {
    const data = linktreeComparison;
    return (
      <MarketingStorySurface label='section-comparison'>
        <MarketingContainer width='prose' className='py-16'>
          <section data-testid='marketing-section-comparison'>
            <h2 className='text-2xl font-semibold text-primary-token'>
              {data.heroHeadline}
            </h2>
            <p className='mt-3 text-sm text-secondary-token'>
              {data.heroSubheadline}
            </p>
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
                  {data.features.slice(0, 6).map(feature => (
                    <tr
                      key={feature.name}
                      className='border-b border-subtle/60'
                    >
                      <td className='py-3 pr-4 text-primary-token'>
                        {feature.name}
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
            <p className='mt-6 text-xs text-tertiary-token'>
              Composition from verified comparison fixtures (
              {getMarketingSection('comparison').component}).
            </p>
          </section>
        </MarketingContainer>
      </MarketingStorySurface>
    );
  },
};

/** faq */
export const Faq: Story = {
  name: 'faq',
  parameters: {
    docs: { description: { story: sectionDocs('faq') } },
  },
  render: () => (
    <MarketingStorySurface label='section-faq'>
      <div data-testid='marketing-section-faq'>
        <FaqSection
          items={ARTIST_PROFILE_COPY.faq.items.map(item => ({
            question: item.question,
            answer: item.answer,
          }))}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/** cta — MarketingFooterCta (shipped under components/site) */
export const Cta: Story = {
  name: 'cta',
  parameters: {
    docs: { description: { story: sectionDocs('cta') } },
  },
  render: () => (
    <MarketingStorySurface label='section-cta'>
      <div data-testid='marketing-section-cta'>
        <MarketingFooterCta
          title='Claim your Jovie'
          ctaLabel='Claim your Jovie'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/** spec-wall */
export const SpecWall: Story = {
  name: 'spec-wall',
  parameters: {
    docs: { description: { story: sectionDocs('spec-wall') } },
  },
  render: () => (
    <MarketingStorySurface label='section-spec-wall'>
      <div data-testid='marketing-section-spec-wall'>
        <ArtistProfileSpecWall
          specWall={ARTIST_PROFILE_COPY.specWall}
          truthTiles={ARTIST_PROFILE_TRUTH_TILES}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/** capture */
export const Capture: Story = {
  name: 'capture',
  parameters: {
    docs: { description: { story: sectionDocs('capture') } },
  },
  render: () => (
    <MarketingStorySurface label='section-capture'>
      <div data-testid='marketing-section-capture'>
        <ArtistProfileCaptureSection capture={ARTIST_PROFILE_COPY.capture} />
      </div>
    </MarketingStorySurface>
  ),
};

/** monetization */
export const Monetization: Story = {
  name: 'monetization',
  parameters: {
    docs: { description: { story: sectionDocs('monetization') } },
  },
  render: () => (
    <MarketingStorySurface label='section-monetization'>
      <div data-testid='marketing-section-monetization'>
        <ArtistProfileMonetizationSection
          monetization={ARTIST_PROFILE_COPY.monetization}
        />
      </div>
    </MarketingStorySurface>
  ),
};

/** ownership — TBD component path */
export const Ownership: Story = {
  name: 'ownership',
  tags: ['wip'],
  parameters: {
    docs: { description: { story: sectionDocs('ownership') } },
  },
  render: () => (
    <MarketingSectionGapPanel
      sectionId='ownership'
      componentPath={getMarketingSection('ownership').component}
      reason='Registry component is TBD (ArtistProfileOwnershipSection not shipped). First implementer creates the section; story remains so the catalog does not silently drop the id.'
    />
  ),
};

/** content-prose — MarketingContentShell prose (route-level blog body is not extracted) */
export const ContentProse: Story = {
  name: 'content-prose',
  tags: ['wip'],
  parameters: {
    docs: { description: { story: sectionDocs('content-prose') } },
  },
  render: () => (
    <MarketingStorySurface label='section-content-prose'>
      <MarketingContentShell>
        <article data-testid='marketing-section-content-prose'>
          <h1 className='text-3xl font-semibold tracking-tight text-primary-token'>
            Long-form marketing prose
          </h1>
          <p className='mt-6 leading-relaxed'>
            Content-prose sections carry SEO and launch narrative body copy. The
            registry still points at the blog post page for full article render;
            this story documents the product prose shell used by marketing
            compositions.
          </p>
          <p className='mt-4 leading-relaxed'>
            Keep copy in data files. Fully static. Dark-only.
          </p>
        </article>
      </MarketingContentShell>
    </MarketingStorySurface>
  ),
};

/** blog-feed — static card grid (BlogCard needs full post/author pipeline) */
export const BlogFeed: Story = {
  name: 'blog-feed',
  tags: ['wip'],
  parameters: {
    docs: { description: { story: sectionDocs('blog-feed') } },
  },
  render: () => (
    <MarketingStorySurface label='section-blog-feed'>
      <MarketingContainer width='page' className='py-16'>
        <section
          className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
          data-testid='marketing-section-blog-feed'
        >
          {[
            {
              title: 'Claim your profile in sixty seconds',
              body: 'A short playbook for going live.',
            },
            {
              title: 'Smart links that convert',
              body: 'Route fans without a link maze.',
            },
            {
              title: 'Release week checklist',
              body: 'Capture and re-engage when music drops.',
            },
          ].map(post => (
            <article
              key={post.title}
              className='rounded-2xl border border-subtle bg-surface-1 p-6'
            >
              <h2 className='text-lg font-semibold text-primary-token'>
                {post.title}
              </h2>
              <p className='mt-3 text-sm text-secondary-token'>{post.body}</p>
            </article>
          ))}
        </section>
        <p className='mt-8 text-xs text-tertiary-token'>
          Fixture feed — full BlogCard path is route-async (
          {getMarketingSection('blog-feed').component}).
        </p>
      </MarketingContainer>
    </MarketingStorySurface>
  ),
};
