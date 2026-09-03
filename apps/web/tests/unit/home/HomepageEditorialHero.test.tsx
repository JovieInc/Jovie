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

function renderHero() {
  return render(
    <HomepageEditorialHero
      headingId='home-hero-heading'
      headline='Control how the world sees you.'
      support={
        'Find what the internet knows about you, bring it together, and turn attention into lasting relationships.'
      }
      search={{ placeholder: 'Search your name', action: 'Find me' }}
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
        'Find what the internet knows about you, bring it together, and turn attention into lasting relationships.'
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

  it('renders the optical stage as decorative structure', () => {
    renderHero();

    const backdrop = screen.getByTestId('homepage-editorial-hero-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(
      backdrop.querySelector('.homepage-editorial-hero__stage')
    ).not.toBeNull();
    expect(backdrop.querySelector('img')).toBeNull();
  });
});
