import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_EDITORIAL_CARDS,
  HomepageEditorialChangelog,
} from './HomepageEditorialChangelog';

describe('HomepageEditorialChangelog', () => {
  it('renders the source-backed changelog preview in editorial card order', () => {
    render(<HomepageEditorialChangelog />);

    const section = screen.getByTestId('homepage-editorial-changelog');
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageEditorialChangelog.tsx'
    );
    expect(section).toHaveAttribute(
      'data-marketing-variant',
      'editorial-preview'
    );
    expect(
      within(section).getByRole('heading', { name: "What's new in Jovie" })
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'All posts' })
    ).toHaveAttribute('href', '/changelog');

    const cards = within(section).getByRole('heading', {
      name: HOMEPAGE_EDITORIAL_CARDS[0].title,
    });
    expect(cards).toBeInTheDocument();
    expect(within(section).getAllByRole('article')).toHaveLength(
      HOMEPAGE_EDITORIAL_CARDS.length
    );

    for (const card of HOMEPAGE_EDITORIAL_CARDS) {
      const articleLink = within(section).getByRole('link', {
        name: new RegExp(`^${card.title}:`),
      });
      const article = articleLink.closest('article');
      expect(article).not.toBeNull();
      if (!article) continue;
      expect(article).toHaveTextContent(card.title);
      expect(article).toHaveTextContent(`${card.category} · ${card.date}`);
      expect(articleLink).toHaveAttribute('href', `/changelog/${card.version}`);
      expect(
        within(article).getByRole('img', {
          name: `${card.title}: ${card.themeSupport}`,
        })
      ).toHaveClass(`homepage-editorial-card__media--${card.theme}`);
    }
  });
});
