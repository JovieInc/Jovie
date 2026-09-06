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
    expect(bar).toHaveAttribute('aria-valuetext', '42%');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('uses the canonical subtle motion easing for width changes', () => {
    render(<ProgressBar value={42} />);

    const indicator = screen.getByRole('progressbar').querySelector(
      '[data-part="indicator"]'
    );
    expect(indicator).toHaveClass('duration-subtle', 'ease-subtle');
    expect(indicator).not.toHaveClass('ease-out');
  });

  it('renders indeterminate state without aria-valuenow', () => {
    render(<ProgressBar indeterminate label='Importing' />);

    const bar = screen.getByRole('progressbar');
    const indicator = bar.querySelector('[data-state="indeterminate"]');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('animate-progress-indeterminate');
    expect(indicator?.className).not.toContain('animate-[');
    expect(bar).toHaveAttribute('data-state', 'indeterminate');
    expect(bar).toHaveAttribute('data-part', 'track');
  });

  it('supports custom label slot via children', () => {
    render(
      <ProgressBar value={10}>
        <span>3 of 30 files</span>
      </ProgressBar>
    );

    expect(screen.getByText('3 of 30 files')).toBeInTheDocument();
  });

  it('keeps aria values in the supplied range while displaying percent', () => {
    render(<ProgressBar min={50} max={150} value={100} showValue />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '150');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '50%');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(bar.querySelector('[data-part="indicator"]')).toHaveStyle({
      width: '50%',
    });
  });

  it('clamps out-of-range values for visual and accessible parity', () => {
    render(<ProgressBar value={140} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '100%');
    expect(bar.querySelector('[data-part="indicator"]')).toHaveStyle({
      width: '100%',
    });
  });

  it('preserves fractional aria values while rounding display text', () => {
    render(<ProgressBar value={42.5} showValue />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42.5');
    expect(bar).toHaveAttribute('aria-valuetext', '43%');
    expect(screen.getByText('43%')).toBeInTheDocument();
  });

  it('falls back to indeterminate semantics for invalid values or ranges', () => {
    render(<ProgressBar value={Number.NaN} min={10} max={10} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-state', 'indeterminate');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuetext');
  });
});
