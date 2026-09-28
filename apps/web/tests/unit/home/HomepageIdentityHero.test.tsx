// Canonical Pen homepage hero (Tim direction 2026-09-26).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';

const { trackAction } = vi.hoisted(() => ({ trackAction: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: trackAction,
}));

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: true }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));
beforeEach(() => {
  gate.WAITLIST_ENABLED = true;
});

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

// Generic identity homepage: no single-ICP wording, no em dashes.
const ICP_TERMS =
  /\b(?:artists?|musicians?|music|songs?|releases?|tours?|fans?|streams?|albums?|presaves?|creators?)\b/i;

function css(): string {
  return readFileSync(
    resolve(process.cwd(), 'components/homepage/HomepageIdentity.css'),
    'utf8'
  );
}

describe('HomepageIdentityHero', () => {
  it('renders the canonical copy with the certified name search even when gated (JOV-5085)', () => {
    render(<HomepageIdentityHero headingId='home-hero-heading' />);

    const hero = screen.getByTestId('marketing-section-hero');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Your living identity on the internet.');
    expect(hero).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      screen.getByText(
        'Your work, your links, your next chapter. Together in your Jovie profile.'
      )
    ).toBeInTheDocument();
    // Pen My0zu (JOV-6914): no kicker above the headline.
    expect(screen.queryByText('Jovie / Identity, connected')).toBeNull();

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Find me'
    );
    expect(screen.queryByText('Request access')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps the name search as the only control while the waitlist is off', () => {
    gate.WAITLIST_ENABLED = false;
    render(<HomepageIdentityHero />);

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Find me'
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('docks the blue technical texture as the one decorative priority layer', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveClass(
      'marketing-hero-dock',
      'marketing-hero-dock--inset'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageIdentityHero.tsx'
    );
    // Pen My0zu (JOV-6914): the hero light is pure CSS, no background image.
    const light = screen.getByTestId('homepage-identity-hero-light');
    expect(light).toHaveAttribute('aria-hidden', 'true');
    expect(light).toHaveAttribute('data-hero-visual', 'ion-light');
    expect(light.querySelector('img')).toBeNull();
    expect(document.querySelectorAll('[data-background-image]')).toHaveLength(
      0
    );
    expect(hero.querySelectorAll('video, canvas')).toHaveLength(0);
  });

  it("shows Tim White's real jov.ie/tim profile as first-party proof (JOV-6946)", () => {
    render(<HomepageIdentityHero />);

    const proof = screen.getByTestId('homepage-hero-real-profile');
    const screenImage = within(proof).getByRole('img');
    expect(screenImage).toHaveAttribute(
      'src',
      HOMEPAGE_MEDIA_MAP.connected.asset.publicUrl
    );
    expect(screenImage.getAttribute('alt')).toContain('jov.ie/tim');
    expect(screen.queryByTestId('homepage-profile-specimen')).toBeNull();
    expect(screen.queryByText(/Avery|Fieldnotes|Illustrative/)).toBeNull();
    expect(within(proof).queryByRole('link')).toBeNull();
  });

  it('keeps hero copy generic and free of em dashes', () => {
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const copy = [
      seo.title,
      seo.description,
      hero.headline,
      hero.subhead,
      hero.proofAlt,
    ];
    for (const line of copy) {
      expect(line).not.toMatch(ICP_TERMS);
      expect(line).not.toContain('—');
    }
    const { container } = render(<HomepageIdentityHero />);
    expect(container.textContent ?? '').not.toMatch(ICP_TERMS);
    expect(container.textContent ?? '').not.toContain('—');
  });

  it('keeps the hero light static and CSS-only (Pen My0zu, JOV-6914)', () => {
    const source = css();
    const light = source.slice(
      source.indexOf('.homepage-identity-hero__light {'),
      source.indexOf('}', source.indexOf('.homepage-identity-hero__light {'))
    );
    expect(light).toContain('radial-gradient(');
    expect(light).toContain('var(--color-accent-blue)');
    expect(light).not.toMatch(/url\(|animation/);
    expect(source).not.toContain('homepage-identity-texture-drift');
  });

  it('keeps the header and copy legible over the texture with a static scrim', () => {
    const source = css();
    const scrim = source.slice(
      source.indexOf('.homepage-identity-hero::before {'),
      source.indexOf('.homepage-identity-hero__light {')
    );
    expect(scrim).toContain('var(--public-shell-header-offset)');
    expect(scrim).toContain('var(--homepage-identity-hero-ground)');
    expect(scrim).not.toContain('animation');
    // Tokens only: no raw colors, no linear namespace.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(source).not.toContain('var(--linear-');
    expect(source).not.toMatch(/\b(?:url|image-set)\s*\(/);
  });
});
