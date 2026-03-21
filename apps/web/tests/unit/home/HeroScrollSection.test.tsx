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
        name: 'One link to launch your music career.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Jovie release dashboard')
    ).toBeInTheDocument();
    expect(screen.getByText('Release drawer')).toBeInTheDocument();
    expect(screen.getAllByText('Releases').length).toBeGreaterThan(0);
  });
});
