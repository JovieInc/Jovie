import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress';

describe('ProgressBar', () => {
  it('renders progressbar with clamped value', () => {
    render(<ProgressBar value={42} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps out-of-range values', () => {
    render(<ProgressBar value={140} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders optional label slot', () => {
    render(<ProgressBar value={25} label='Uploading 25%' />);

    expect(screen.getByText('Uploading 25%')).toBeInTheDocument();
  });

  it('sets fill width from value', () => {
    render(<ProgressBar value={33} />);

    const fill = screen.getByRole('progressbar').firstElementChild;
    expect(fill).toHaveStyle({ width: '33%' });
  });
});