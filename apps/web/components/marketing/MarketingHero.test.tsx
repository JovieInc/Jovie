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
    expect(heroRoots[0]).not.toHaveAttribute('data-marketing-variant');
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
    expect(heading).toHaveClass('marketing-hero-headline', 'line-clamp-2');
    expect(heading).not.toHaveClass('line-clamp-3');
    expect(heading).toHaveAttribute(
      'id',
      MARKETING_HERO_DEFAULT_PROPS.headingId
    );
    expect(heading).toHaveClass('marketing-h1-max-two-lines');
    expect(heading).not.toHaveStyle({ WebkitLineClamp: '3' });
    expect(heading).not.toHaveAttribute('aria-label');
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

  it('supports the three-line Jovie Card headline without changing the default clamp', () => {
    render(
      <MarketingHero
        headline='Your Jovie profile. Ready for the real world.'
        subtitle='Join the list for access updates.'
        headingId='jovie-card-heading'
        testId='jovie-card-hero'
        sectionVariant='split-screenshot-right'
        headlineMaxLines={3}
        primaryCta={{ label: 'Join the list', href: '#join-the-list' }}
        logos={false}
      />
    );

    const hero = screen.getByTestId('jovie-card-hero');
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/MarketingHero.tsx'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your Jovie profile. Ready for the real world.',
    });
    expect(heading).toHaveClass('marketing-hero-headline', 'line-clamp-3');
    expect(heading).not.toHaveClass(
      'line-clamp-2',
      'marketing-h1-max-two-lines'
    );
    expect(heading).toHaveStyle({ WebkitLineClamp: '3' });
    // jsdom 30 simplifies the shipped `calc(3 * 1lh)` declaration to `calc(3lh)`.
    const specifiedMaxBlockSize = heading.style.maxBlockSize.replaceAll(
      ' ',
      ''
    );
    expect(specifiedMaxBlockSize).toMatch(/^calc\(3(?:\*1)?lh\)$/);
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
    expect(
      screen.getByRole('heading', { level: 1, name: 'Landing title' })
    ).toHaveClass('marketing-h1-max-two-lines');
  });

  it('uses the canonical growing action contract for a landing secondary CTA', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='landing-actions-heading'
        title='Landing title'
        body='Landing body'
        media={<div>Media</div>}
        secondaryCtaLabel='See pricing'
        secondaryCtaHref='/pricing'
      />
    );

    const secondary = screen.getByRole('link', { name: 'See pricing' });
    expect(secondary).toHaveAttribute('href', '/pricing');
    expect(secondary).toHaveAttribute('data-variant', 'ghost');
    expect(secondary).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11'
    );
    expect(secondary).not.toHaveClass('h-10');
  });

  it('routes route-owned presentation through the unstyled shell without hero chrome', () => {
    render(
      <MarketingHero
        variant='unstyled'
        className='homepage-poster-hero'
        headingId='unstyled-heading'
        testId='unstyled-hero'
      >
        <h1 id='unstyled-heading'>Route-owned hero</h1>
      </MarketingHero>
    );

    const shell = screen.getByTestId('unstyled-hero');
    expect(shell).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
    expect(shell).toHaveAttribute('aria-labelledby', 'unstyled-heading');
    // Route-owned presentation: canonical Pen root + caller class only —
    // no default hero spacing, elevation, or layout chrome.
    expect(shell).toHaveClass('homepage-poster-hero');
    expect(shell.className).not.toContain('relative w-full');
    expect(shell.className).not.toContain('pt-20');
    expect(shell.className).not.toContain('pb-16');
    expect(shell.className).not.toContain('max-w-300');
  });

  it('keeps canonical hero chrome on styled shell variants', () => {
    render(
      <MarketingHero
        variant='centered'
        sectionVariant='centered-none'
        headingId='centered-heading'
        testId='centered-hero'
      >
        <h1 id='centered-heading'>Centered hero</h1>
      </MarketingHero>
    );

    const shell = screen.getByTestId('centered-hero');
    expect(shell.dataset.marketingVariant).toBe('centered-none');
    expect(shell).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
    expect(shell).toHaveClass('relative', 'w-full');
    expect(shell).toHaveClass('pt-20', 'pb-16');
    expect(shell).toHaveClass('items-center', 'text-center');
  });

  it('paints the landing hero backdrop through the shared token class', () => {
    // The --linear-hero-backdrop token is consumed only through the shared
    // .marketing-hero-backdrop class (linear-tokens.css). Landing heroes
    // must not inline the var: new --linear-* identities are ratcheted
    // per-file and the namespace count is shrink-only.
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='backdrop-heading'
        title='Backdrop title'
        body='Backdrop body'
        media={<div>Media</div>}
        testId='backdrop-hero'
      />
    );

    const shell = screen.getByTestId('backdrop-hero');
    expect(shell.querySelector('.marketing-hero-backdrop')).not.toBeNull();
    expect(shell.querySelector('.marketing-hero-backdrop')).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0'
    );
    expect(shell.innerHTML).not.toContain('--linear-hero-backdrop');
  });
});
