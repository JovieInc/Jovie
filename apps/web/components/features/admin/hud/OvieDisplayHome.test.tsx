import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieDisplayHome } from './OvieDisplayHome';

vi.mock('./OvieHomeCanvas', () => ({
  OvieHomeCanvas: () => <div data-testid='ovie-home-canvas' />,
}));

describe('OvieDisplayHome', () => {
  it('shows Home and accepts no pointer input', () => {
    const { container } = render(<OvieDisplayHome />);
    expect(screen.getByTestId('ovie-home-canvas')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
  });
});
