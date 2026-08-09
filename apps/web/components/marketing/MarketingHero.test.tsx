import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingHero } from './MarketingHero';
import marketingHeroMeta, {
  MARKETING_HERO_DEFAULT_PROPS,
  MARKETING_HERO_SOURCE_SHA,
  SourceBackedDefault,
} from './MarketingHero.stories';

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <div data-testid='home-trust-section' />,
}));

describe('MarketingHero source-backed default story', () => {
  it('renders one labelled hero root with the canonical checked-in copy', () => {
    const { container } = render(
      <MarketingHero {...MARKETING_HERO_DEFAULT_PROPS} />
    );

    const heroRoots = container.querySelectorAll('section.marketing-hero');
    expect(heroRoots).toHaveLength(1);
    expect(heroRoots[0]).toHaveAttribute(
      'aria-labelledby',
      MARKETING_HERO_DEFAULT_PROPS.headingId
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Drop more music, with less work.',
    });
    expect(heading).toHaveAttribute(
      'id',
      MARKETING_HERO_DEFAULT_PROPS.headingId
    );
    expect(
      screen.getByText(
        'The AI workspace for artists to plan releases, create assets, pitch playlists, and promote every drop.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Claim my workspace' })
    ).toHaveAttribute('href', '/start');
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByTestId('home-trust-section')).toBeInTheDocument();
  });

  it('binds Storybook directly to MarketingHero and limits the Pen claim', () => {
    expect(marketingHeroMeta.component).toBe(MarketingHero);
    expect(SourceBackedDefault.args).toBe(MARKETING_HERO_DEFAULT_PROPS);
    expect(marketingHeroMeta.parameters.pen).toEqual({
      identity: 'section.hero/SijpA',
      registryId: 'section.hero',
      penNodeId: 'SijpA',
      sourcePath: 'apps/web/components/marketing/MarketingHero.tsx',
      sourceExport: 'MarketingHero',
      sourceSha: MARKETING_HERO_SOURCE_SHA,
      proofScope: 'source-backed-default-only',
      outstanding:
        'Active variant-to-route mapping remains owner-stacked and is not proven by this story.',
    });
  });
});
