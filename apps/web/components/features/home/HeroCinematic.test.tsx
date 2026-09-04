import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroCinematic } from './HeroCinematic';

interface MockHeroClaimHandleProps {
  readonly submitButtonTestId?: string;
}

vi.mock('./HeroClaimHandle', () => ({
  HeroClaimHandle: ({ submitButtonTestId }: MockHeroClaimHandleProps) => (
    <form data-testid='hero-claim-handle'>
      <button data-testid={submitButtonTestId} type='submit'>
        Claim
      </button>
    </form>
  ),
}));

vi.mock('./HeroDesktopPreviewMount', () => ({
  HeroDesktopPreviewMount: () => (
    <div data-testid='hero-desktop-preview'>desktop preview</div>
  ),
}));

describe('HeroCinematic', () => {
  it('renders bounded hero copy, primary claim CTA, and preview receipt', () => {
    render(<HeroCinematic />);

    const shell = screen.getByTestId('homepage-shell');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'The Link Your Music Deserves.',
    });

    expect(shell).toBeInTheDocument();
    expect(heading).toHaveClass('marketing-h1-linear', 'line-clamp-2');
    expect(screen.getByTestId('hero-claim-handle')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-primary-cta')).toBeInTheDocument();
    expect(screen.getByTestId('hero-desktop-preview')).toBeInTheDocument();
  });
});
