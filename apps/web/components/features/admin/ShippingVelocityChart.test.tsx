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

  it('raises the closed-series toggle from 0.8 to full opacity when pressed', () => {
    render(<ShippingVelocityChart initialData={[]} initialRange='7d' />);
    const toggle = screen.getByRole('button', {
      name: 'Toggle Closed Series Visibility',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveStyle({ opacity: '0.8' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ opacity: '1' });
  });
});
