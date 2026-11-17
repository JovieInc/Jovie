import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ContentMetricStat,
  ContentMetricStatSkeleton,
} from './ContentMetricStat';

describe('ContentMetricStat certificate', () => {
  it('renders the label, value and subtitle with their class overrides', async () => {
    const { container } = render(
      <ContentMetricStat
        label='Current DAU'
        value='1,284'
        subtitle='Last 14 days'
        valueClassName='text-success'
        subtitleClassName='text-tertiary-token'
      />
    );

    expect(screen.getByText('Current DAU')).toHaveClass('truncate');
    expect(screen.getByText('1,284')).toHaveClass(
      'tabular-nums',
      'text-success'
    );
    expect(screen.getByText('Last 14 days')).toHaveClass('text-tertiary-token');
    await expectNoA11yViolations(container);
  });

  it('drops the subtitle line for a partial stat', async () => {
    const { container } = render(
      <ContentMetricStat label='Current DAU' value='1,284' />
    );

    expect(container.querySelectorAll('p')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('hides the loading skeleton and keeps long and Arabic stats axe-clean', async () => {
    const longLabel = 'Daily active listeners across every connected service';
    const { container } = render(
      <div>
        <ContentMetricStatSkeleton labelWidthClassName='w-24' />
        <ContentMetricStat label={longLabel} value='1,284' />
        <div dir='rtl' lang='ar'>
          <ContentMetricStat
            label='المستخدمون النشطون'
            value='1,284'
            subtitle='آخر 14 يومًا'
          />
        </div>
      </div>
    );

    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton?.firstElementChild).toHaveClass('w-24', 'skeleton');
    expect(screen.getByText(longLabel)).toHaveClass('truncate');
    expect(screen.getByText('آخر 14 يومًا')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
