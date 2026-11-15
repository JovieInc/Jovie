import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileOutcomeDuo } from './ArtistProfileOutcomeDuo';
import {
  EmptyDrawers,
  LongContentLabels,
  RtlArabic,
} from './ArtistProfileOutcomeDuo.states.stories';

const DUO = ARTIST_PROFILE_COPY.outcomeDuo;

describe('ArtistProfileOutcomeDuo certificate', () => {
  it('shows tour months as written, without forced capitals', async () => {
    const { container } = render(
      <ArtistProfileOutcomeDuo headline={DUO.marketingHeadline} duo={DUO} />
    );

    const firstRow = DUO.cards.sellOut.drawerRows[0];
    const month = screen.getAllByText(firstRow.month)[0];
    expect(month).toHaveClass('ap-outcome-date');
    expect(month.className).not.toMatch(/\buppercase\b/);
    expect(within(month).getByText(firstRow.day).tagName).toBe('STRONG');
    await expectNoA11yViolations(container);
  });

  it('keeps both outcome tiles when the drawers have no rows', async () => {
    const duo = EmptyDrawers.args?.duo ?? DUO;
    const { container } = render(
      <ArtistProfileOutcomeDuo headline={DUO.marketingHeadline} duo={duo} />
    );

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText('$10')).not.toBeInTheDocument();
    expect(screen.queryByText('The Novo')).not.toBeInTheDocument();
    expect(screen.getByText(DUO.cards.getPaid.ctaLabel)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('truncates long venues per row and keeps long labels whole', async () => {
    const duo = LongContentLabels.args?.duo ?? DUO;
    const { container } = render(
      <ArtistProfileOutcomeDuo
        headline={LongContentLabels.args?.headline ?? DUO.marketingHeadline}
        duo={duo}
      />
    );

    const venue = screen.getByText(duo.cards.sellOut.drawerRows[0].venue);
    expect(venue).toHaveClass('truncate');
    expect(
      screen.getByRole('heading', { level: 3, name: duo.cards.getPaid.label })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass(
      'line-clamp-2'
    );
    await expectNoA11yViolations(container);
  });

  it('renders Arabic labels in a right-to-left document', async () => {
    const duo = RtlArabic.args?.duo ?? DUO;
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileOutcomeDuo
          headline={RtlArabic.args?.headline ?? DUO.marketingHeadline}
          duo={duo}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 3, name: duo.cards.sellOut.label })
    ).toBeInTheDocument();
    expect(screen.getAllByText('التذاكر')).toHaveLength(
      duo.cards.sellOut.drawerRows.length
    );
    await expectNoA11yViolations(container);
  });
});
