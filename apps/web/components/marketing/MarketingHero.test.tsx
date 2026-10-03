import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it('puts an explicit delegated owner on the semantic root in both shell and content modes', () => {
    const owner = 'apps/web/components/homepage/HomepageIdentityHero.tsx';
    const shell = render(
      <MarketingHero
        variant='split'
        testId='delegated-hero'
        sectionVariant='split-claim-card'
        sectionOwner={owner}
      >
        <h1>Claim your name</h1>
      </MarketingHero>
    );
    const root = screen.getByTestId('delegated-hero');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-marketing-owner', owner);
    expect(root).toHaveAttribute('data-marketing-variant', 'split-claim-card');
    shell.unmount();
    render(
      <MarketingHero
        headline='Pricing'
        subtitle='Free profiles.'
        primaryCta={{ label: 'Claim', href: '/start' }}
        logos={false}
        sectionVariant='centered-none'
        sectionOwner={owner}
        testId='delegated-content'
      />
    );
    expect(screen.getByTestId('delegated-content')).toHaveAttribute(
      'data-marketing-owner',
      owner
    );
  });

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

  it('excludes the MARKETING_HERO_* fixture exports from the story index', () => {
    const exclude = marketingHeroMeta.excludeStories;
    expect(exclude).toEqual(/^MARKETING_HERO_/);
    const pattern = exclude as RegExp;
    expect(pattern.test('MARKETING_HERO_DEFAULT_PROPS')).toBe(true);
    expect(pattern.test('MARKETING_HERO_SOURCE_SHA')).toBe(true);
    expect(pattern.test('SourceBackedDefault')).toBe(false);
    expect(pattern.test('LandingActions')).toBe(false);
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

  it('lets a landing hero opt out of headline clamping', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='unclamped-heading'
        title='Never clipped headline'
        body='Landing body'
        media={<div>Media</div>}
        headlineMaxLines='none'
      />
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Never clipped headline',
    });
    expect(heading).not.toHaveClass(
      'line-clamp-2',
      'line-clamp-3',
      'marketing-h1-max-two-lines'
    );
    expect(heading.getAttribute('style')).toBe(
      'display: block; max-block-size: none; overflow: visible; -webkit-box-orient: initial; -webkit-line-clamp: unset;'
    );
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

  it('docks the content and landing heroes under the header', () => {
    const { container } = render(
      <MarketingHero {...MARKETING_HERO_DEFAULT_PROPS} />
    );
    // Content mode already pads by the header height, so it only bleeds.
    const content = container.querySelector('section.marketing-hero');
    expect(content).toHaveClass('marketing-hero-dock');
    expect(content).not.toHaveClass('marketing-hero-dock--inset');

    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='dock-heading'
        title='Dock title'
        body='Dock body'
        media={<div>Media</div>}
        testId='dock-hero'
      />
    );
    // Landing mode keeps its copy offset as inner inset (no arbitrary pt).
    const landing = screen.getByTestId('dock-hero');
    expect(landing).toHaveClass(
      'marketing-hero-landing',
      'marketing-hero-dock',
      'marketing-hero-dock--inset'
    );
    expect(landing.className).not.toMatch(/\bpt-\[/);
  });

  it('leaves shell heroes out of the dock contract', () => {
    render(
      <MarketingHero variant='left' testId='shell-hero'>
        <h1>Shell</h1>
      </MarketingHero>
    );
    expect(screen.getByTestId('shell-hero')).not.toHaveClass(
      'marketing-hero-dock'
    );
  });

  it('renders the unique per-route hero photo behind content-mode copy when provided', () => {
    render(
      <MarketingHero
        {...MARKETING_HERO_DEFAULT_PROPS}
        testId='photo-content-hero'
        photo={{
          src: '/images/marketing-hero/product.webp',
          width: 1600,
          height: 901,
        }}
      />
    );

    const hero = screen.getByTestId('photo-content-hero');
    expect(hero).toHaveClass('relative', 'overflow-hidden');
    const photo = hero.querySelector('.marketing-hero-photo');
    expect(photo).not.toBeNull();
    expect(photo?.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('product.webp')
    );
    expect(photo?.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('omits the hero photo layer and the relative/overflow classes without a photo prop', () => {
    const { container } = render(
      <MarketingHero {...MARKETING_HERO_DEFAULT_PROPS} />
    );

    const hero = container.querySelector('section.marketing-hero');
    expect(hero?.querySelector('.marketing-hero-photo')).toBeNull();
    expect(hero?.className).not.toContain('overflow-hidden');
  });

  it('applies the requested opacity to the landing-mode hero photo', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='photo-landing-heading'
        title='Landing title'
        body='Landing body'
        media={<div>Media</div>}
        testId='photo-landing-hero'
        photo={{
          src: '/images/marketing-hero/ai.webp',
          width: 1600,
          height: 1067,
          opacity: 0.2,
        }}
      />
    );

    const hero = screen.getByTestId('photo-landing-hero');
    const img = hero.querySelector('.marketing-hero-photo img');
    expect(img).toHaveStyle({ opacity: '0.2' });
  });
});

describe('MarketingHero photo stacking', () => {
  it('keeps hero copy above the positioned hero photo', () => {
    // The photo layer is positioned (z-index 0); static copy after it would
    // paint underneath, which hid the /pricing headline in production.
    const css = readFileSync(
      resolve(__dirname, '../../app/globals.css'),
      'utf8'
    );

    expect(css).toMatch(
      /\.marketing-hero-photo ~ \*\s*\{\s*position: relative;\s*z-index: 1;/
    );
  });
});

vi.mock('next/link', async () => {
  const { createElement, forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      import('react').ComponentProps<'a'> & { prefetch?: boolean }
    >(function PrefetchObservedLink({ prefetch, href, ...props }, ref) {
      return createElement('a', {
        ...props,
        href: href ?? '#',
        ref,
        'data-test-prefetch': String(prefetch),
      });
    }),
  };
});

it('defers auth prefetch while preserving public hero defaults and explicit choices', () => {
  const view = render(
    <MarketingHero
      headline='Release your work'
      subtitle='Choose a destination'
      logos={false}
      primaryCta={{ label: 'Start', href: '/start' }}
      secondaryCta={{ label: 'Pricing', href: '/pricing' }}
    />
  );
  expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
    'data-test-prefetch',
    'false'
  );
  expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
    'data-test-prefetch',
    'undefined'
  );
  view.rerender(
    <MarketingHero
      headline='Release your work'
      subtitle='Choose a destination'
      logos={false}
      primaryCta={{ label: 'Start', href: '/start', prefetch: true }}
      secondaryCta={{ label: 'Pricing', href: '/pricing', prefetch: false }}
    />
  );
  expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
    'href',
    '/start'
  );
  expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
    'data-test-prefetch',
    'true'
  );
  expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
    'data-test-prefetch',
    'false'
  );
});
