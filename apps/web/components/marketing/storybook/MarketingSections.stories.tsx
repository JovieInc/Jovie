import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { HomeStatQuoteSection } from '@/components/features/home/HomeStatQuoteSection';
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
import { ArtistProfileFaq } from '@/components/marketing/artist-profile/ArtistProfileFaq';
import { ArtistProfileFinalCta } from '@/components/marketing/artist-profile/ArtistProfileFinalCta';
import { ArtistProfileHero } from '@/components/marketing/artist-profile/ArtistProfileHero';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from '@/components/marketing/artist-profile/ArtistProfileHowItWorks';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile/ArtistProfileLandingPage';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile/ArtistProfileModeSwitcher';
import { ArtistProfileMonetizationSection } from '@/components/marketing/artist-profile/ArtistProfileMonetizationSection';
import { ArtistProfileOpinionatedSection } from '@/components/marketing/artist-profile/ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { ArtistProfileSocialProof } from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';
import { getComparison } from '@/content/comparisons';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import {
  getMarketingSection,
  MARKETING_SECTION_IDS,
  type MarketingSectionId,
} from '@/data/marketing';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import {
  MARKETING_SECTION_STORY_GAPS,
  STORY_BLOG_POSTS,
  STORY_FAQ_ITEMS,
  STORY_PROSE_PARAGRAPHS,
} from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

/**
 * One composition story per MARKETING_SECTION_IDS entry.
 * Storybook titles: Marketing/Sections/<sectionId>
 *
 * Uses the registry `component` path when a shippable product component exists.
 * TBD/legacy paths are tagged `wip` and listed in MARKETING_SECTION_STORY_GAPS.
 */
const meta = {
  title: 'Marketing/Sections',
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Section catalog: ${MARKETING_SECTION_IDS.join(', ')}.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function SectionFrame({
  sectionId,
  children,
}: Readonly<{ sectionId: MarketingSectionId; children: ReactNode }>) {
  const section = getMarketingSection(sectionId);
  return (
    <div
      className='bg-base text-primary-token'
      data-testid={`marketing-section-${sectionId}`}
      data-section-component={section.component}
      data-proof-class={section.proofClass}
    >
      <MarketingPageShell>{children}</MarketingPageShell>
    </div>
  );
}

function WipSectionPlaceholder({
  sectionId,
}: Readonly<{ sectionId: MarketingSectionId }>) {
  const section = getMarketingSection(sectionId);
  const gap = MARKETING_SECTION_STORY_GAPS.find(g => g.sectionId === sectionId);
  return (
    <SectionFrame sectionId={sectionId}>
      <MarketingContainer width='page' className='py-16'>
        <p className='text-xs font-medium uppercase tracking-wide text-tertiary-token'>
          WIP Section · registry component pending
        </p>
        <h2 className='mt-3 text-2xl font-semibold text-primary-token'>
          {section.label}
        </h2>
        <p className='mt-3 max-w-prose text-sm text-secondary-token'>
          Registry component: <code>{section.component}</code>
        </p>
        {gap ? (
          <p className='mt-2 max-w-prose text-sm text-tertiary-token'>
            Story strategy: {gap.storyStrategy}
          </p>
        ) : null}
        <ul className='mt-6 list-disc space-y-1 pl-5 text-sm text-secondary-token'>
          {section.requiredInputs.map(input => (
            <li key={input}>
              required: <code>{input}</code>
            </li>
          ))}
        </ul>
        <ul className='mt-4 list-disc space-y-1 pl-5 text-sm text-tertiary-token'>
          {section.neverUse.slice(0, 3).map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </MarketingContainer>
    </SectionFrame>
  );
}

export const hero: Story = {
  name: 'hero',
  render: () => (
    <SectionFrame sectionId='hero'>
      <MarketingHero
        headingId='section-hero-heading'
        headline='One Adaptive Profile For Every Release'
        subtitle='Capture every fan, route them to the right listen path, and reactivate them automatically.'
        primaryCta={{ label: 'Get started', href: APP_ROUTES.SIGNUP }}
        secondaryCta={{
          label: 'See a live profile',
          href: APP_ROUTES.ARTIST_PROFILES,
        }}
      />
      <div className='border-t border-subtle'>
        <ArtistProfileHero hero={ARTIST_PROFILE_COPY.hero} />
      </div>
    </SectionFrame>
  ),
};

export const logoCloud: Story = {
  name: 'logo-cloud',
  render: () => (
    <SectionFrame sectionId='logo-cloud'>
      <HomeTrustSection presentation='inline-strip' />
    </SectionFrame>
  ),
};

export const featureGrid: Story = {
  name: 'feature-grid',
  render: () => (
    <SectionFrame sectionId='feature-grid'>
      <ArtistProfileOutcomesCarousel outcomes={ARTIST_PROFILE_COPY.outcomes} />
    </SectionFrame>
  ),
};

export const featureSplit: Story = {
  name: 'feature-split',
  render: () => (
    <SectionFrame sectionId='feature-split'>
      <ArtistProfileHeroAdaptiveIntro
        hero={ARTIST_PROFILE_COPY.hero}
        adaptive={ARTIST_PROFILE_COPY.adaptive}
      />
      <ArtistProfileModeSwitcher
        adaptive={ARTIST_PROFILE_COPY.adaptive}
        showIntroHeading={false}
      />
    </SectionFrame>
  ),
};

export const howItWorks: Story = {
  name: 'how-it-works',
  render: () => (
    <SectionFrame sectionId='how-it-works'>
      <ArtistProfileHowItWorks howItWorks={ARTIST_PROFILE_COPY.howItWorks} />
    </SectionFrame>
  ),
};

export const artistProfileAssembly: Story = {
  name: 'artist-profile-assembly',
  render: () => (
    <SectionFrame sectionId='feature-split'>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={{ FULL_PAGE: false, SOCIAL_PROOF: false, FAQ: false }}
      />
    </SectionFrame>
  ),
};

export const socialProof: Story = {
  name: 'social-proof',
  render: () => (
    <SectionFrame sectionId='social-proof'>
      {ARTIST_PROFILE_SOCIAL_PROOF.hasRealQuotes ? (
        <ArtistProfileSocialProof
          socialProof={ARTIST_PROFILE_COPY.socialProof}
          proofData={ARTIST_PROFILE_SOCIAL_PROOF}
        />
      ) : (
        <MarketingContainer width='page' className='py-16'>
          <p className='text-sm text-secondary-token'>
            Zero-proof path: social-proof omitted (no verified quotes in
            fixture). Registry proofClass=proof.
          </p>
        </MarketingContainer>
      )}
    </SectionFrame>
  ),
};

export const artistProfileChrome: Story = {
  name: 'artist-profile-chrome',
  parameters: {
    docs: {
      description: {
        story:
          'Canonical Artist Profiles page chrome: shared section grid, quiet FAQ, and the same compact close used by the homepage.',
      },
    },
  },
  render: () => (
    <SectionFrame sectionId='cta'>
      <ArtistProfileSectionShell>
        <ArtistProfileFaq faq={ARTIST_PROFILE_COPY.faq} />
      </ArtistProfileSectionShell>
      <ArtistProfileFinalCta finalCta={ARTIST_PROFILE_COPY.finalCta} />
      <HomepageV2FinalCta />
    </SectionFrame>
  ),
};

export const stats: Story = {
  name: 'stats',
  tags: ['wip'],
  parameters: {
    docs: {
      description: {
        story:
          'Proof-class section. Story renders the shipped HomeStatQuoteSection shape; production must only mount with verified stats (zero-proof = omit).',
      },
    },
  },
  render: () => (
    <SectionFrame sectionId='stats'>
      <MarketingContainer width='page' className='py-8'>
        <p className='mb-6 text-xs text-tertiary-token'>
          WIP gap: registry path `components/marketing/HomeStatQuoteSection`
          resolves to `components/features/home/HomeStatQuoteSection`. Do not
          fabricate metrics on live pages.
        </p>
      </MarketingContainer>
      <HomeStatQuoteSection
        stat='—'
        body='Stats band mounts only with verified aggregate data. Story shows layout chrome without a fabricated multiplier.'
        source='Fixture-safe placeholder · zero-proof law'
      />
    </SectionFrame>
  ),
};

export const pricing: Story = {
  name: 'pricing',
  render: () => (
    <SectionFrame sectionId='pricing'>
      <MarketingContainer width='page' className='py-16'>
        <MarketingPricingPlans ctaVariant='secondary' mode='expanded' />
      </MarketingContainer>
    </SectionFrame>
  ),
};

export const comparison: Story = {
  name: 'comparison',
  tags: ['wip'],
  render: () => {
    const data = getComparison('linktree');
    if (!data) return <WipSectionPlaceholder sectionId='comparison' />;
    return (
      <SectionFrame sectionId='comparison'>
        <MarketingContainer width='page' className='py-16'>
          <h2 className='text-2xl font-semibold text-primary-token'>
            Jovie vs {data.competitor}
          </h2>
          <p className='mt-2 text-sm text-tertiary-token'>
            WIP: registry points at ComparisonData; matrix is page-local. Story
            composes verified competitor rows from content/comparisons.
          </p>
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
                {data.features.slice(0, 8).map(row => (
                  <tr key={row.name} className='border-b border-subtle'>
                    <th
                      scope='row'
                      className='py-3 pr-4 font-normal text-primary-token'
                    >
                      {row.name}
                    </th>
                    <td className='py-3 pr-4'>
                      {row.jovie ? (
                        <Check className='h-4 w-4' aria-label='Yes' />
                      ) : (
                        <Minus className='h-4 w-4' aria-label='No' />
                      )}
                    </td>
                    <td className='py-3'>
                      {row.competitor ? (
                        <Check className='h-4 w-4' aria-label='Yes' />
                      ) : (
                        <Minus className='h-4 w-4' aria-label='No' />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MarketingContainer>
      </SectionFrame>
    );
  },
};

export const faq: Story = {
  name: 'faq',
  render: () => (
    <SectionFrame sectionId='faq'>
      <FaqSection items={[...STORY_FAQ_ITEMS]} />
    </SectionFrame>
  ),
};

export const cta: Story = {
  name: 'cta',
  tags: ['wip'],
  render: () => (
    <SectionFrame sectionId='cta'>
      <MarketingFooterCta
        title='Request Access to Jovie.'
        body='Join the private launch list for the release platform built for independent artists.'
      />
    </SectionFrame>
  ),
};

export const specWall: Story = {
  name: 'spec-wall',
  render: () => (
    <SectionFrame sectionId='spec-wall'>
      <ArtistProfileSpecWall
        specWall={ARTIST_PROFILE_COPY.specWall}
        truthTiles={ARTIST_PROFILE_TRUTH_TILES}
      />
    </SectionFrame>
  ),
};

export const capture: Story = {
  name: 'capture',
  render: () => (
    <SectionFrame sectionId='capture'>
      <ArtistProfileCaptureSection
        capture={ARTIST_PROFILE_COPY.capture}
        id='storybook-capture'
      />
      <ArtistProfileOpinionatedSection
        opinionated={ARTIST_PROFILE_COPY.opinionated}
      />
    </SectionFrame>
  ),
};

export const monetization: Story = {
  name: 'monetization',
  render: () => (
    <SectionFrame sectionId='monetization'>
      <ArtistProfileMonetizationSection
        monetization={ARTIST_PROFILE_COPY.monetization}
      />
    </SectionFrame>
  ),
};

export const ownership: Story = {
  name: 'ownership',
  tags: ['wip'],
  render: () => <WipSectionPlaceholder sectionId='ownership' />,
};

export const contentProse: Story = {
  name: 'content-prose',
  tags: ['wip'],
  render: () => (
    <SectionFrame sectionId='content-prose'>
      <MarketingContentShell>
        <h2 className='text-2xl font-semibold text-primary-token'>
          Content Prose
        </h2>
        {STORY_PROSE_PARAGRAPHS.map(paragraph => (
          <p key={paragraph.slice(0, 24)} className='mt-4'>
            {paragraph}
          </p>
        ))}
      </MarketingContentShell>
    </SectionFrame>
  ),
};

export const blogFeed: Story = {
  name: 'blog-feed',
  render: () => (
    <SectionFrame sectionId='blog-feed'>
      <MarketingContainer width='page' className='py-16'>
        <div className='grid gap-6 md:grid-cols-3'>
          {STORY_BLOG_POSTS.map(post => (
            <StoryBlogCard key={post.slug} post={post} />
          ))}
        </div>
      </MarketingContainer>
    </SectionFrame>
  ),
};
