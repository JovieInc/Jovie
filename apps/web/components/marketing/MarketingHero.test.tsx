import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
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
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
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

  it('honors the shared root test id in landing mode', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='landing-heading'
        title='Landing title'
        body='Landing body'
        media={<div>Media</div>}
        testId='route-hero'
      />
    );

    expect(screen.getByTestId('route-hero')).toHaveAttribute(
      'aria-labelledby',
      'landing-heading'
    );
  });
});

describe('MarketingHero — shell mode', () => {
  it('keeps canonical hero spacing on styled shell variants', () => {
    render(
      <MarketingHero
        variant='left'
        headingId='styled-heading'
        testId='styled-hero'
      >
        <h1 id='styled-heading'>Styled heading</h1>
      </MarketingHero>
    );

    const hero = screen.getByTestId('styled-hero');
    expect(hero).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
    expect(hero).toHaveClass('relative', 'w-full', 'pt-20');
  });

  it('delegates route-owned presentation to the unstyled shell root', () => {
    render(
      <MarketingHero
        variant='unstyled'
        headingId='owned-heading'
        testId='owned-hero'
        className='route-owned-presentation'
      >
        <h1 id='owned-heading'>Owned heading</h1>
      </MarketingHero>
    );

    const hero = screen.getByTestId('owned-hero');
    expect(hero).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
    expect(hero).toHaveAttribute('aria-labelledby', 'owned-heading');
    expect(hero).toHaveClass('route-owned-presentation');
    expect(hero).not.toHaveClass('relative', 'w-full', 'pt-20');
    expect(
      screen.getByRole('heading', { name: 'Owned heading' })
    ).toBeInTheDocument();
  });
});
