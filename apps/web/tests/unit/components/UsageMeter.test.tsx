import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageMeter } from '@/components/molecules/UsageMeter';
import { createUsageMeterModel } from '@/lib/usage/model';

describe('UsageMeter', () => {
  it('renders remaining capacity, one warning threshold, and accessible status', () => {
    const model = createUsageMeterModel({ used: 40, limit: 100 });
    expect(model).not.toBeNull();

    render(
      <UsageMeter
        label='Weekly messages'
        model={model!}
        resetLabel='Resets in 2h'
      />
    );

    const bar = screen.getByRole('progressbar', {
      name: 'Weekly messages remaining',
    });
    expect(bar).toHaveAttribute('value', '60');
    expect(bar).toHaveAttribute('max', '100');
    expect(bar).toHaveAttribute(
      'aria-valuetext',
      '60 of 100 remaining. On pace.'
    );
    const track = screen.getByTestId('usage-meter-track');
    expect(screen.getByTestId('usage-meter-fill')).toHaveStyle({
      width: '60%',
    });
    expect(track.querySelectorAll('[data-threshold]')).toHaveLength(1);
    expect(track.querySelector('[data-threshold="warning"]')).toHaveStyle({
      left: '20%',
    });
  });

  it('does not rely on color alone for critical state', () => {
    const model = createUsageMeterModel({ used: 95, limit: 100 });
    expect(model).not.toBeNull();

    render(
      <UsageMeter
        label='Live actions'
        model={model!}
        resetLabel='Resets in 12m'
      />
    );

    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Near limit'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '5 of 100 remaining. Near limit.'
    );
  });

  it('uses the error treatment only after the weekly balance is exhausted', () => {
    const model = createUsageMeterModel({ used: 100, limit: 100 });
    expect(model).not.toBeNull();

    render(
      <UsageMeter
        label='Weekly messages'
        model={model!}
        resetLabel='Resets in 2d'
      />
    );

    expect(screen.getByTestId('usage-meter-track')).toHaveClass('bg-error/20');
    expect(screen.getByTestId('usage-meter-state-label')).toHaveClass(
      'text-error'
    );
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Limit reached'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '0 of 100 remaining. Limit reached.'
    );
  });
});
