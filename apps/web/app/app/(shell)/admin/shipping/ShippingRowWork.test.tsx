import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShippingRowWork } from './ShippingRowWork';

describe('ShippingRowWork', () => {
  it('shows a leading error dot and the attention label for failing work', () => {
    const { container } = render(
      <ShippingRowWork
        title='Failing release'
        identifier='JOV-1'
        prNumber={101}
        attention='failing'
        attentionLabel='Failing'
      />
    );

    expect(
      container.querySelector('[data-attention-dot="failing"]')
    ).not.toBeNull();
    expect(screen.getByText('Failing release')).toHaveClass('font-medium');
    expect(screen.getByText('JOV-1 · #101 · Failing')).toHaveClass(
      'text-2xs'
    );
  });

  it('omits the dot and label when nothing needs attention', () => {
    const { container } = render(
      <ShippingRowWork
        title='Fine'
        identifier='JOV-2'
        prNumber={null}
        attention='ok'
        attentionLabel={null}
      />
    );

    expect(container.querySelector('[data-attention-dot]')).toBeNull();
    expect(screen.getByText('JOV-2')).toBeInTheDocument();
  });
});
