import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistProfileModesShowcase } from '@/features/home/ArtistProfileModesShowcase';

vi.mock('@/features/home/phone-showcase-primitives', () => ({
  PhoneShowcase: ({
    activeIndex,
  }: {
    activeIndex?: number;
    modes: readonly { outcome: string }[];
  }) => <div data-testid='phone-showcase'>active:{activeIndex ?? 0}</div>,
}));

describe('ArtistProfileModesShowcase', () => {
  it('switches the displayed mode when a mode button is clicked', () => {
    render(<ArtistProfileModesShowcase />);

    expect(screen.getByTestId('phone-showcase')).toHaveTextContent('active:0');

    fireEvent.click(screen.getByRole('button', { name: /Sell tickets/i }));

    expect(screen.getByTestId('phone-showcase')).toHaveTextContent('active:1');
  });
});
