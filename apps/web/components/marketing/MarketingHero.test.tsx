import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(heading).toHaveAttribute(
      'id',
      MARKETING_HERO_DEFAULT_PROPS.headingId
    );
    expect(heading).toHaveClass('marketing-h1-max-two-lines');
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

  it('renders the developer variant command leaf and reports clipboard success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <MarketingHero
        variant='developer'
        headingId='developer-heading'
        testId='developer-hero'
        headline='Developer hero'
        subtitle='Read-only public data.'
        className='custom-developer-hero'
        install={{
          command: 'jovie --help',
          copyLabel: 'Copy command',
          copiedLabel: 'Copied command',
          errorLabel: 'Copy failed',
          availabilityNote: 'Available now.',
        }}
      />
    );

    const copyButton = screen.getByRole('button', { name: 'Copy command' });
    expect(
      screen.getByRole('heading', { name: 'Developer hero' })
    ).not.toHaveClass('line-clamp-2');
    expect(screen.getByTestId('developer-hero')).toHaveClass(
      'marketing-hero--centered',
      'custom-developer-hero'
    );
    expect(copyButton).toHaveAttribute('type', 'button');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('jovie --help');
      expect(
        screen.getByRole('button', { name: 'Copied command' })
      ).toBeInTheDocument();
    });
  });

  it('reports clipboard rejection through the developer command leaf', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    render(
      <MarketingHero
        variant='developer'
        headingId='developer-error-heading'
        testId='developer-error-hero'
        headline='Developer hero'
        subtitle='Read-only public data.'
        install={{
          command: 'jovie --version',
          copyLabel: 'Copy command',
          copiedLabel: 'Copied command',
          errorLabel: 'Copy failed',
          availabilityNote: 'Available now.',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
    });
  });
});
