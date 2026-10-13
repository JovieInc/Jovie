import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jovieMarkAtSize } from '@/lib/brand/tokens';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the selected brand with its accessible name and size', () => {
    render(
      <BrandLogo variant='ov' size='splash' tone='color' rounded={false} />
    );

    const mark = screen.getByRole('img', { name: 'OV' });
    expect(mark).toHaveAttribute('width', '32');
    expect(mark).toHaveAttribute('height', '32');
    expect(mark.parentElement).toHaveAttribute('data-brand-variant', 'ov');
    expect(mark.parentElement).toHaveClass('text-accent');
    expect(mark.parentElement).not.toHaveClass('rounded-full');
  });

  it('omits decorative marks from the accessible tree', () => {
    const { container } = render(<BrandLogo aria-hidden size={24} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-label');
  });

  it('draws the same pixel-master O for every variant', () => {
    const master = jovieMarkAtSize(16);
    const { container } = render(
      <>
        <BrandLogo variant='jovie' size={16} />
        <BrandLogo variant='ov' size={16} />
      </>
    );

    const marks = container.querySelectorAll('svg');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark).toHaveAttribute('viewBox', master.viewBox);
      expect(mark.querySelector('path')).toHaveAttribute('d', master.d);
    }
  });
});
