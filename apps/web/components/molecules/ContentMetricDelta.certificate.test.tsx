import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentMetricDelta } from './ContentMetricDelta';

describe('ContentMetricDelta certificate', () => {
  it('speaks the label instead of the bare figure when one is given', async () => {
    const { container } = render(
      <ContentMetricDelta
        direction='up'
        value='+12.5%'
        aria-label='Up 12.5% from last week'
        data-testid='delta'
      />
    );

    const delta = screen.getByTestId('delta');
    expect(delta).toHaveClass('text-success');
    expect(screen.getByText('Up 12.5% from last week')).toHaveClass('sr-only');
    expect(screen.getByText('+12.5%')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('shows a flat zero change and a partial falling value', async () => {
    const { container } = render(
      <div>
        <ContentMetricDelta direction='flat' value='0%' data-testid='flat' />
        <ContentMetricDelta direction='down' value='-4.1%' data-testid='down' />
      </div>
    );

    expect(screen.getByTestId('flat')).toHaveClass('text-tertiary-token');
    expect(screen.getByTestId('down')).toHaveClass('text-error');
    expect(screen.getByText('-4.1%')).not.toHaveAttribute('aria-hidden');
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      2
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long comparison and an Arabic label axe-clean', async () => {
    const { container } = render(
      <div>
        <ContentMetricDelta
          direction='up'
          value='+1,284 listeners vs. the previous 28 days'
          className='w-40'
        />
        <div dir='rtl' lang='ar'>
          <ContentMetricDelta
            direction='up'
            value='+12.5%'
            aria-label='ارتفاع بنسبة 12.5٪'
          />
        </div>
      </div>
    );

    expect(
      screen.getByText('+1,284 listeners vs. the previous 28 days')
    ).toBeInTheDocument();
    expect(screen.getByText('ارتفاع بنسبة 12.5٪')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });
});
