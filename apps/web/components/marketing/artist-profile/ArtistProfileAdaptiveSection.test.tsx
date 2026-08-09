import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getMarketingSection, resolveComposition } from '@/data/marketing';
import {
  ARTIST_PROFILE_ADAPTIVE_VARIANT,
  ArtistProfileAdaptiveSection,
} from './ArtistProfileAdaptiveSection';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

describe('ArtistProfileAdaptiveSection', () => {
  it('renders the shipped phone-right body as one accessible tablist', () => {
    render(
      <ArtistProfileAdaptiveSection adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    const section = screen.getByTestId('artist-profile-section-adaptive');
    expect(section).toHaveAttribute('data-marketing-section', 'feature-split');
    expect(section).toHaveAttribute(
      'data-feature-split-variant',
      ARTIST_PROFILE_ADAPTIVE_VARIANT
    );
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One profile. Right action.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.modes[0].screenshotAlt,
      })
    ).toBeInTheDocument();
  });

  it('is the active default body for the artist adaptive feature split', () => {
    const section = getMarketingSection('feature-split');
    const phoneRight = section.variants.find(
      variant => variant.id === ARTIST_PROFILE_ADAPTIVE_VARIANT
    );

    expect(section.component).toBe(
      'components/marketing/artist-profile/ArtistProfileAdaptiveSection'
    );
    expect(section.defaultVariant).toBe(ARTIST_PROFILE_ADAPTIVE_VARIANT);
    expect(phoneRight).toMatchObject({
      status: 'active',
      exemplar: { route: '/artist-profiles', section: 'adaptive' },
    });
    expect(
      section.variants.find(variant => variant.id === 'screenshot-right')
    ).toMatchObject({ status: 'unproven' });

    const composition = resolveComposition({
      businessObjective: 'Show how one profile adapts across a release cycle.',
      targetAudience: 'artist',
      desiredConversion: 'claim-profile',
      intent: 'artist-profile',
    });
    const adaptive = composition.sections.find(
      candidate => candidate.sectionId === 'feature-split'
    );
    expect(adaptive?.variantId).toBe('bordered-screenshot-left');
  });

  it('keeps the route wrapper and section catalog on the same shared body', () => {
    const heroSource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro.tsx'
      ),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/storybook/MarketingSections.stories.tsx'
      ),
      'utf8'
    );
    const featureSplitStory = storySource.slice(
      storySource.indexOf('export const featureSplit'),
      storySource.indexOf('export const howItWorks')
    );

    expect(heroSource).toContain('<ArtistProfileAdaptiveSection');
    expect(heroSource).not.toContain('<ArtistProfileModeSwitcher');
    expect(
      featureSplitStory.match(/<ArtistProfileAdaptiveSection/g)
    ).toHaveLength(1);
    expect(featureSplitStory).toContain(
      'variantId={ARTIST_PROFILE_ADAPTIVE_VARIANT}'
    );
    expect(featureSplitStory).not.toContain('ArtistProfileHeroAdaptiveIntro');
    expect(featureSplitStory).not.toContain('ArtistProfileModeSwitcher');
    expect(featureSplitStory).not.toContain('HomeTrustSection');
    expect(storySource).not.toContain('artistProfileAssembly');
  });
});
