import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_PROFILE_OUTCOMES_VARIANT,
  ArtistProfileOutcomesCarousel,
} from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getMarketingSection, resolveComposition } from '@/data/marketing';

const EXPECTED_OUTCOMES = ['Listen', 'Show Up', 'Support', 'Stay Close'];
const EXPECTED_OUTCOME_IDS = [
  'straight-to-listen',
  'local-dates-first',
  'support-without-friction',
  'capture-the-fan',
];

describe('section.feature-grid ledger-four contract', () => {
  it('registers only the shipped ledger body and resolves it deterministically', () => {
    const section = getMarketingSection('feature-grid');

    expect(section.component).toBe(
      'components/marketing/artist-profile/ArtistProfileOutcomesCarousel'
    );
    expect(section.variants.map(variant => variant.id)).toEqual([
      ARTIST_PROFILE_OUTCOMES_VARIANT,
    ]);
    expect(section.defaultVariant).toBe(ARTIST_PROFILE_OUTCOMES_VARIANT);

    const composition = resolveComposition({
      businessObjective: 'Help artists turn profile visits into fan actions.',
      targetAudience: 'artist',
      desiredConversion: 'claim-profile',
      intent: 'artist-profile',
    });
    const featureGrid = composition.sections.find(
      candidate => candidate.sectionId === 'feature-grid'
    );
    expect(featureGrid?.variantId).toBe(ARTIST_PROFILE_OUTCOMES_VARIANT);
  });

  it('renders exactly the four production outcomes as an ordered list', () => {
    expect(ARTIST_PROFILE_COPY.outcomes.landingCards).toHaveLength(4);
    expect(
      ARTIST_PROFILE_COPY.outcomes.landingCards.map(outcome => outcome.id)
    ).toEqual(EXPECTED_OUTCOME_IDS);

    render(
      <ArtistProfileOutcomesCarousel outcomes={ARTIST_PROFILE_COPY.outcomes} />
    );

    const ledger = screen.getByRole('list', { name: 'Fan Outcomes' });
    expect(ledger.tagName).toBe('OL');
    expect(ledger).toHaveAttribute(
      'data-feature-grid-variant',
      ARTIST_PROFILE_OUTCOMES_VARIANT
    );
    expect(
      within(ledger)
        .getAllByRole('heading', { level: 3 })
        .map(heading => heading.textContent)
    ).toEqual(EXPECTED_OUTCOMES);
    expect(within(ledger).getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps the section story bound to the same registered component body', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/storybook/MarketingSections.stories.tsx'
      ),
      'utf8'
    );

    expect(storySource).toContain('data-section-variant={variantId}');
    expect(storySource).toContain(
      "<SectionFrame sectionId='logo-cloud' variantId='proof-moment'>"
    );
    expect(storySource).toContain(
      'variantId={ARTIST_PROFILE_OUTCOMES_VARIANT}'
    );
    expect(storySource).toContain('<ArtistProfileOutcomesCarousel');
    expect(storySource).not.toContain('MarketingFeatureGrid');
  });
});
