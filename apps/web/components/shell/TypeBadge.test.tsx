import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it('renders the label as-is', () => {
    render(<TypeBadge label='single' />);
    expect(screen.getByText('single')).toBeInTheDocument();
  });

  it('forwards custom classNames to the chip', () => {
    const { container } = render(
      <TypeBadge label='ep' className='custom-tone' />
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'custom-tone'
    );
  });
});
