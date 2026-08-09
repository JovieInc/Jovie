import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingContentProse } from '@/components/marketing/MarketingContentProse';
import { getMarketingSectionRegistryEntry } from '@/data/marketing';

describe('MarketingContentProse', () => {
  it('renders sanitized long-form HTML inside the canonical prose width', () => {
    render(
      <MarketingContentProse html='<h2 id="release-rhythm">Release rhythm</h2><p>Ship something every Friday.</p><a href="/blog">Read more</a>' />
    );

    const section = screen.getByRole('region', { name: 'Article content' });
    expect(section).toHaveClass('w-full', 'max-w-prose-canonical');
    expect(section).toHaveAttribute('data-marketing-section', 'content-prose');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Release rhythm' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute(
      'href',
      '/blog'
    );
  });

  it('is the registered source for section.content-prose', () => {
    expect(getMarketingSectionRegistryEntry('content-prose')).toMatchObject({
      id: 'section.content-prose',
      source: 'apps/web/components/marketing/MarketingContentProse',
      storybookTitle: 'Marketing/Sections/content-prose',
    });
  });
});
