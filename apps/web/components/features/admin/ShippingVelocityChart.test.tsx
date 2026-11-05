import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingVelocityChart } from './ShippingVelocityChart';

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid='velocity-chart' />,
}));

describe('ShippingVelocityChart', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [] }), { status: 200 })
        )
      )
    );
  });

  it('dims only the swatch while the closed series is hidden', () => {
    render(<ShippingVelocityChart initialData={[]} initialRange='7d' />);
    const toggle = screen.getByRole('button', {
      name: 'Toggle Closed Series Visibility',
    });
    // The swatch dims, never the label text: 80% label opacity failed WCAG AA.
    const swatch = toggle.querySelector('span');
    expect(swatch).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(swatch).toHaveStyle({ opacity: '0.4' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(swatch).toHaveStyle({ opacity: '1' });
  });
});
