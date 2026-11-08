import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { ProgressBar } from './progress';

describe('ProgressBar', () => {
  it('renders determinate progress with label and value', () => {
    render(<ProgressBar value={42} label='Uploading' showValue />);

    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('Uploading')).toHaveClass('text-primary-token');
    expect(screen.getByText('42%')).toHaveClass(
      'text-tertiary-token',
      'tabular-nums',
      'shrink-0'
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');

    render(<ProgressBar value={0} label='Waiting' />);
    expect(screen.getAllByRole('progressbar')[1]).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(bar).toHaveAttribute('aria-valuetext', '42%');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it.each([
    { state: 'waiting', props: { value: 0 } },
    {
      state: 'partial',
      props: { value: 42, label: 'Uploading', showValue: true },
    },
    { state: 'complete', props: { value: 100 } },
    { state: 'implicit indeterminate', props: {} },
    {
      state: 'explicit indeterminate',
      props: { value: 42, indeterminate: true },
    },
    { state: 'invalid value', props: { value: Number.NaN } },
  ])(
    'uses canonical tokens and reduced-motion fallbacks when $state',
    ({ props }) => {
      render(<ProgressBar {...props} />);

      const bar = screen.getByRole('progressbar');
      const indicator = bar.querySelector('[data-part="indicator"]');
      expect(bar).toHaveClass('bg-surface-2', 'w-full', 'overflow-hidden');
      expect(indicator).toHaveClass(
        'bg-accent',
        'duration-subtle',
        'ease-subtle',
        'motion-reduce:transition-none'
      );
      expect(indicator).not.toHaveClass('ease-out');
      if (bar.dataset.state === 'indeterminate') {
        expect(indicator).toHaveClass(
          'animate-progress-indeterminate',
          'motion-reduce:animate-none'
        );
        expect(bar).not.toHaveAttribute('aria-valuenow');
        expect(bar).not.toHaveAttribute('aria-valuetext');
      }
    }
  );

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

describe('ProgressBar state stories', () => {
  it('renders the track without a header when only an aria-label is given', () => {
    const { container } = render(
      <ProgressBar value={64} aria-label='Uploading cover artwork' />
    );

    expect(
      screen.getByRole('progressbar', { name: 'Uploading cover artwork' })
    ).toHaveAttribute('aria-valuenow', '64');
    expect(container.querySelector('.justify-between')).toBeNull();
  });

  it('truncates a long label while keeping the percentage visible', () => {
    render(
      <ProgressBar
        value={73}
        label='Importing the complete back catalog from every connected distributor'
        showValue
      />
    );

    expect(
      screen.getByText(
        'Importing the complete back catalog from every connected distributor'
      )
    ).toHaveClass('min-w-0', 'truncate');
    expect(screen.getByText('73%')).toHaveClass('shrink-0');
  });
});

describe('ProgressBar accessibility', () => {
  it('has no axe violations for labelled, aria-labelled, empty, indeterminate and RTL bars', async () => {
    const { container } = render(
      <div>
        <ProgressBar value={42} label='Importing releases' showValue />
        <ProgressBar value={64} aria-label='Uploading cover artwork' />
        <ProgressBar value={0} label='Waiting to start import' showValue />
        <ProgressBar indeterminate label='Matching profiles' />
        <div dir='rtl' lang='ar'>
          <ProgressBar value={42} label='جارٍ استيراد الإصدارات' showValue />
        </div>
      </div>
    );

    await expectNoA11yViolations(container);
  });

  it('mirrors only the indeterminate track for right-to-left layouts', () => {
    const { rerender } = render(
      <ProgressBar indeterminate label='Importing' />
    );
    expect(screen.getByRole('progressbar')).toHaveClass('rtl:-scale-x-100');

    rerender(<ProgressBar value={40} label='Importing' />);
    expect(screen.getByRole('progressbar')).not.toHaveClass('rtl:-scale-x-100');
  });
});
