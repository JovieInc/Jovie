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
});
