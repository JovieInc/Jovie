import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroScrollSection } from '@/features/home/HeroScrollSection';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

describe('HeroScrollSection', () => {
  it('renders the hero heading and dashboard shell', () => {
    renderWithQueryClient(<HeroScrollSection />);

    expect(
      screen.getByRole('heading', {
        name: 'The link your music deserves.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('hero-dashboard-screenshot')).toBeInTheDocument();
  });
});
