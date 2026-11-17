import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';

const OUTCOMES = ARTIST_PROFILE_COPY.outcomes;

describe('ArtistProfileOutcomesCarousel', () => {
  it('renders at most four numbered outcome rows under the header', async () => {
    const { container } = render(
      <ArtistProfileOutcomesCarousel outcomes={OUTCOMES} />
    );

    expect(
      screen.getByRole('heading', { name: OUTCOMES.headline })
    ).toBeInTheDocument();
    const ledger = screen.getByRole('list', { name: 'Audience Outcomes' });
    const rows = within(ledger).getAllByRole('listitem');
    expect(rows).toHaveLength(Math.min(4, OUTCOMES.landingCards.length));
    expect(rows[0]).toHaveTextContent('01');
    expect(
      within(rows[0]).getByRole('heading', {
        name: OUTCOMES.landingCards[0].title,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-section-feature-grid')
    ).toHaveAttribute('data-marketing-variant', '4-ledger');
    await expectNoA11yViolations(container);
  });

  it('keeps the header and an empty ledger when there are no cards', async () => {
    const { container } = render(
      <ArtistProfileOutcomesCarousel
        outcomes={{ ...OUTCOMES, landingCards: [] }}
      />
    );

    expect(
      screen.getByRole('heading', { name: OUTCOMES.headline })
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId('artist-profile-outcome-card')).toHaveLength(
      0
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long copy whole and stays axe-clean', async () => {
    const description = `${OUTCOMES.landingCards[0].description} ${OUTCOMES.landingCards[0].description}`;
    const { container } = render(
      <ArtistProfileOutcomesCarousel
        outcomes={{
          ...OUTCOMES,
          landingCards: [{ ...OUTCOMES.landingCards[0], description }],
        }}
      />
    );

    expect(screen.getByText(description)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileOutcomesCarousel
          outcomes={{ ...OUTCOMES, headline: 'مبني حول نتائج الجمهور.' }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'مبني حول نتائج الجمهور.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
