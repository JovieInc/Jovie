import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection';

const MONETIZATION_CARDS = [
  ARTIST_PROFILE_COPY.monetization.irlPaymentsCard,
  ARTIST_PROFILE_COPY.monetization.captureCard,
  ARTIST_PROFILE_COPY.monetization.thanksCard,
  ARTIST_PROFILE_COPY.monetization.reengageCard,
] as const;

describe('ArtistProfileMonetizationSection source contract', () => {
  it('renders the canonical four-card earning loop with stable semantics and copy', () => {
    const { container } = render(
      <ArtistProfileMonetizationSection
        monetization={ARTIST_PROFILE_COPY.monetization}
      />
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.monetization
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.monetization.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.monetization.subhead)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Monetization Card Carousel' })
    ).toBeInTheDocument();

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(MONETIZATION_CARDS.length);

    for (const [index, copy] of MONETIZATION_CARDS.entries()) {
      expect(
        within(cards[index]).getByRole('heading', {
          level: 3,
          name: copy.title,
        })
      ).toBeInTheDocument();
      expect(within(cards[index]).getByText(copy.body)).toBeInTheDocument();
    }
  });

  it('binds the adjacent Pen story directly to the production component and fixture', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileMonetizationSection.stories.tsx'
      ),
      'utf8'
    );

    expect(storySource).toContain(
      "import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection'"
    );
    expect(storySource).toContain(
      'component: ArtistProfileMonetizationSection'
    );
    expect(storySource).toContain(
      'monetization: ARTIST_PROFILE_COPY.monetization'
    );
    expect(storySource).toContain("registryId: 'section.monetization'");
    expect(storySource).toContain("penRoot: 'F3grtS'");
    expect(storySource).toContain(
      "uncoveredProps: ['cardId', 'textAnchor', 'visualSide']"
    );
    expect(storySource).toContain("body: 'four-card-earning-loop-carousel'");
    expect(storySource).toContain(
      "routeMount: 'omitted-on-current-production-route'"
    );
    expect(storySource).toContain(
      "bindingStatus: 'registry-reclassification-owner-stacked'"
    );
  });
});
