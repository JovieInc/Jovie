import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAlternatives } from '@/content/alternatives';
import { getComparisons } from '@/content/comparisons';
import { MarketingCatalogPage } from './MarketingCatalogPage';

describe('MarketingCatalogPage', () => {
  it('lists shipped comparisons so /compare is not an empty 404 hub', () => {
    const items = getComparisons().map(comparison => ({
      href: `/compare/${comparison.slug}`,
      title: comparison.title,
      description: comparison.heroSubheadline,
    }));

    render(
      <MarketingCatalogPage
        eyebrow='Compare'
        title='Jovie vs the tools you already know'
        description='See how Jovie compares with the tools musicians already use.'
        listHeading='Comparisons'
        items={items}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie vs the tools you already know',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: items[0]?.title })).toHaveAttribute(
      'href',
      items[0]?.href
    );
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', '/signup');
    expect(items.map(item => item.href)).toEqual(
      expect.arrayContaining(['/compare/linktree', '/compare/linkfire'])
    );
  });

  it('lists shipped alternative guides so /alternatives is not an empty 404 hub', () => {
    const items = getAlternatives().map(alternative => ({
      href: `/alternatives/${alternative.slug}`,
      title: alternative.title,
      description: alternative.heroSubheadline,
    }));

    render(
      <MarketingCatalogPage
        eyebrow='Alternatives'
        title='Jovie alternatives for musicians'
        description='Browse Jovie alternatives to link-in-bio tools.'
        listHeading='Alternative guides'
        items={items}
      />
    );

    expect(items.map(item => item.href)).toEqual(
      expect.arrayContaining([
        '/alternatives/linktree',
        '/alternatives/link-in-bio',
      ])
    );
    expect(screen.getByRole('link', { name: items[0]?.title })).toHaveAttribute(
      'href',
      items[0]?.href
    );
  });
});
