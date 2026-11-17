import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FrostedContainer } from './FrostedContainer';

vi.mock('@/components/atoms/BackgroundPattern', () => ({
  BackgroundPattern: ({ variant }: { readonly variant: string }) => (
    <div data-testid='background-pattern' data-variant={variant} />
  ),
}));

describe('FrostedContainer', () => {
  it('uses min-h-svh so iOS Safari chrome cannot jump the profile shell', () => {
    const { container } = render(
      <FrostedContainer backgroundPattern='none' showGradientBlurs={false}>
        <p>profile body</p>
      </FrostedContainer>
    );

    expect(container.firstElementChild?.className).toContain('min-h-svh');
    expect(container.firstElementChild?.className).not.toContain(
      'min-h-screen'
    );
    expect(screen.getByText('profile body')).toBeInTheDocument();
  });

  it('paints the page and solid card with the surface token, not raw white', () => {
    const { container } = render(
      <FrostedContainer variant='solid' backgroundPattern='none'>
        <p>solid body</p>
      </FrostedContainer>
    );
    expect(container.firstElementChild).toHaveClass('bg-surface-1');
    expect(container.firstElementChild).not.toHaveClass('bg-white');
    expect(screen.getByText('solid body').parentElement).toHaveClass(
      'bg-surface-1'
    );
  });
});
