// Canonical Pen homepage hero (Tim direction 2026-09-26).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_HERO_TEXTURE,
  HomepageIdentityHero,
} from '@/components/homepage/HomepageIdentityHero';
import { HomepageProfileSpecimen } from '@/components/homepage/HomepageProfileSpecimen';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

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
    expect(heading).toHaveTextContent('A living identity for the internet.');
    expect(hero).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      screen.getByText(
        'Your work, your links, your next chapter. Together in your Jovie profile.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Jovie / Identity, connected')).toBeInTheDocument();

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
    const texture = screen.getByTestId('homepage-identity-hero-texture');
    expect(texture).toHaveAttribute('aria-hidden', 'true');
    expect(texture).toHaveAttribute(
      'data-background-image',
      HOMEPAGE_HERO_TEXTURE.src
    );
    const image = texture.querySelector('img');
    expect(image).toHaveAttribute('src', HOMEPAGE_HERO_TEXTURE.src);
    expect(image).toHaveAttribute('data-priority', 'true');
    expect(image).toHaveAttribute('alt', '');
    expect(document.querySelectorAll('[data-background-image]')).toHaveLength(
      1
    );
    expect(hero.querySelectorAll('video, canvas')).toHaveLength(0);
  });

  it('labels the fictional specimen and keeps its action non-interactive', () => {
    render(<HomepageIdentityHero />);

    const specimen = screen.getByTestId('homepage-profile-specimen');
    expect(specimen).toHaveAttribute('data-illustrative', 'true');
    expect(
      within(specimen).getByText('Your Jovie profile · Illustrative preview')
    ).toBeInTheDocument();
    const portrait = within(specimen).getByRole('img');
    expect(portrait).toHaveAttribute(
      'src',
      '/assets/generated/homepage-avery-chen-portrait-v1.webp'
    );
    expect(portrait.getAttribute('alt')).toMatch(/fictional example/);
    expect(within(specimen).queryByRole('link')).toBeNull();
    expect(within(specimen).queryByRole('button')).toBeNull();
  });

  it('renders the standalone specimen with a sized portrait and two rows', () => {
    render(
      <HomepageProfileSpecimen
        specimen={HOMEPAGE_IDENTITY_COPY.hero.specimen}
      />
    );
    const specimen = screen.getByTestId('homepage-profile-specimen');
    expect(within(specimen).getAllByRole('listitem')).toHaveLength(2);
    const portrait = within(specimen).getByRole('img');
    expect(portrait).toHaveAttribute('width', '128');
    expect(portrait).toHaveAttribute('height', '128');
  });

  it('keeps hero copy generic and free of em dashes', () => {
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const copy = [
      seo.title,
      seo.description,
      hero.eyebrow,
      hero.headline,
      hero.subhead,
      hero.specimen.name,
      hero.specimen.bio,
      hero.specimen.caption,
      ...hero.specimen.rows.flatMap(row => [row.title, row.detail]),
    ];
    for (const line of copy) {
      expect(line).not.toMatch(ICP_TERMS);
      expect(line).not.toContain('—');
    }
    const { container } = render(<HomepageIdentityHero />);
    expect(container.textContent ?? '').not.toMatch(ICP_TERMS);
    expect(container.textContent ?? '').not.toContain('—');
  });

  it('keeps motion CSS-only, bounded, offscreen-paused, and still under reduced motion', () => {
    const source = css();
    const texture = source.slice(
      source.indexOf('.homepage-identity-hero__texture {'),
      source.indexOf('}', source.indexOf('.homepage-identity-hero__texture {'))
    );
    expect(texture).toMatch(
      /animation: homepage-identity-texture-drift 20s ease-in-out infinite/
    );
    expect(texture).toContain('content-visibility: auto');
    const keyframes = source.slice(
      source.indexOf('@keyframes homepage-identity-texture-drift'),
      source.indexOf('@media (prefers-reduced-motion: reduce)')
    );
    expect(keyframes).toContain('calc(-1 * var(--space-3))');
    expect(keyframes).toContain('scale(1.02)');
    expect(keyframes).not.toMatch(/hue-rotate|filter/);
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.homepage-identity-hero__texture \{\s*animation: none;/
    );
    expect(source.match(/animation:/g)).toHaveLength(2);
  });

  it('keeps the header and copy legible over the texture with a static scrim', () => {
    const source = css();
    const scrim = source.slice(
      source.indexOf('.homepage-identity-hero::before {'),
      source.indexOf('.homepage-identity-hero__texture {')
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
