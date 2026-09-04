import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the selected brand with its accessible name and size', () => {
    render(<BrandLogo variant='ov' size={64} tone='color' rounded={false} />);

    const mark = screen.getByRole('img', { name: 'OV' });
    expect(mark).toHaveAttribute('width', '64');
    expect(mark).toHaveAttribute('height', '64');
    expect(mark.parentElement).toHaveAttribute('data-brand-variant', 'ov');
    expect(mark.parentElement).toHaveClass('text-accent');
    expect(mark.parentElement).not.toHaveClass('rounded-full');
  });

  it('omits decorative marks from the accessible tree', () => {
    const { container } = render(<BrandLogo aria-hidden size={24} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-label');
  });
});
