import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress';

describe('ProgressBar', () => {
  it('exposes accessible progressbar semantics', () => {
    render(<ProgressBar value={40} ariaLabel='Upload progress' />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-label', 'Upload progress');
  });

  it('renders the label slot and percent by default', () => {
    render(<ProgressBar value={62} label='Importing releases' />);
    expect(screen.getByText('Importing releases')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('drops the redundant aria-label when a visible label is present', () => {
    render(<ProgressBar value={10} label='Uploading' />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-label');
  });

  it('derives the accessible name from the visible label', () => {
    render(<ProgressBar value={10} label='Importing releases' />);
    // Accessible name is computed from aria-labelledby → the label span.
    expect(
      screen.getByRole('progressbar', { name: 'Importing releases' })
    ).toBeInTheDocument();
  });

  it('forwards arbitrary props (data-testid) to the wrapper', () => {
    render(<ProgressBar value={10} data-testid='import-progress' />);
    expect(screen.getByTestId('import-progress')).toBeInTheDocument();
  });

  it('hides the percent when showValue is false', () => {
    render(<ProgressBar value={80} label='Sync' showValue={false} />);
    expect(screen.queryByText('80%')).not.toBeInTheDocument();
  });

  it('clamps values above 100 and below 0', () => {
    const { rerender } = render(<ProgressBar value={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100'
    );
    rerender(<ProgressBar value={-20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  });

  it('coerces NaN to 0', () => {
    render(<ProgressBar value={Number.NaN} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  });

  it('sets the fill width to the clamped percent', () => {
    render(<ProgressBar value={62} label='x' />);
    const fill = screen.getByRole('progressbar').firstElementChild;
    expect(fill).toHaveStyle({ width: '62%' });
  });

  it('applies the small track height', () => {
    render(<ProgressBar value={30} size='sm' />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-1');
  });

  it('applies the default medium track height', () => {
    render(<ProgressBar value={30} />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-2');
  });

  it('rounds fractional percentages', () => {
    render(<ProgressBar value={62.6} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '63'
    );
  });

  it('renders no header row when label is absent and showValue is false', () => {
    const { container } = render(
      <ProgressBar value={50} showValue={false} ariaLabel='Sync' />
    );
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
    const wrapper = container.firstElementChild;
    expect(wrapper?.children).toHaveLength(1);
    expect(wrapper?.firstElementChild).toHaveAttribute('role', 'progressbar');
  });

  it('shows only the percent in the header when no label is provided', () => {
    render(<ProgressBar value={45} />);
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('respects reduced motion on the fill transition', () => {
    render(<ProgressBar value={30} />);
    const fill = screen.getByRole('progressbar').firstElementChild;
    expect(fill?.className).toContain('motion-reduce:transition-none');
  });
});
