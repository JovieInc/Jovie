import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress';

describe('ProgressBar', () => {
  it('renders determinate progress with label and value', () => {
    render(<ProgressBar value={42} label='Uploading' showValue />);

    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders indeterminate state without aria-valuenow', () => {
    render(<ProgressBar indeterminate label='Importing' />);

    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(
      bar.querySelector('[data-state="indeterminate"]')
    ).toBeInTheDocument();
  });

  it('supports custom label slot via children', () => {
    render(
      <ProgressBar value={10}>
        <span>3 of 30 files</span>
      </ProgressBar>
    );

    expect(screen.getByText('3 of 30 files')).toBeInTheDocument();
  });
});
