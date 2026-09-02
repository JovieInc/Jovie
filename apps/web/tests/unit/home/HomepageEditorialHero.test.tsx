import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';

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

const BACKDROP = {
  desktopSrc: '/images/hero/night-desk.webp',
  desktopWidth: 1536,
  desktopHeight: 1024,
  mobileSrc: '/images/hero/night-desk-mobile.webp',
  mobileWidth: 737,
  mobileHeight: 1024,
} as const;

function renderHero() {
  return render(
    <HomepageEditorialHero
      headingId='home-hero-heading'
      headline='Control how the world sees you.'
      support='Find what the internet knows. Turn it into relationships.'
      search={{ placeholder: 'Search your name', action: 'Find me' }}
      backdrop={BACKDROP}
    />
  );
}

describe('HomepageEditorialHero', () => {
  it('renders one heading, one support line, and the name search as the only control', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveTextContent('Control how the world sees you.');
    expect(screen.getByTestId('homepage-hero-shell')).toHaveAttribute(
      'aria-labelledby',
      heading.id
    );
    expect(
      screen.getByText(
        'Find what the internet knows. Turn it into relationships.'
      )
    ).toBeInTheDocument();

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', 'Search your name');

    const submit = screen.getByTestId('homepage-primary-cta');
    expect(submit).toHaveTextContent('Find me');
    expect(submit).toHaveAttribute('data-size', 'marketing');
    expect(submit).toHaveAttribute('data-variant', 'primary');
    expect(submit).toHaveClass('h-8', 'rounded-full');
    expect(submit).toBeEnabled();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('art-directs the backdrop as a decorative picture', () => {
    renderHero();

    const backdrop = screen.getByTestId('homepage-editorial-hero-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');

    const source = backdrop.querySelector('source');
    expect(source).toHaveAttribute('media', '(max-width: 767px)');
    expect(source?.getAttribute('srcset')).toContain('night-desk-mobile');

    const img = backdrop.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img?.getAttribute('srcset') ?? img?.getAttribute('src')).toContain(
      'night-desk'
    );
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });
});
