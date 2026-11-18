import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ContentChartFrame,
  ContentChartSkeleton,
  ContentChartState,
} from './ContentChartState';

describe('ContentChartState certificate', () => {
  it('announces the loading skeleton with its label', async () => {
    const { container } = render(
      <ContentChartSkeleton label='Loading streams' testId='chart-loading' />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading streams');
    expect(screen.getByTestId('chart-loading')).toHaveClass('h-64');
    await expectNoA11yViolations(container);
  });

  it('shows an empty chart as a status with its title', async () => {
    const { container } = render(
      <ContentChartState
        state='empty'
        title='No usage data'
        message='No usage data available yet.'
        heightClassName='h-48'
        testId='chart-empty'
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-state', 'empty');
    expect(status).toHaveTextContent('No usage data');
    expect(screen.getByTestId('chart-empty')).toHaveClass('h-48');
    await expectNoA11yViolations(container);
  });

  it('raises an error as an alert and keeps the retry action usable', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <ContentChartState
        state='error'
        title='Chart unavailable'
        message='We could not load streams for this range.'
        action={
          <Button size='sm' onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not load streams for this range.'
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders a partial message, long copy and an RTL frame axe-clean', async () => {
    const longMessage =
      'Listener counts arrive from each service a day or two after release. Check back once every service has reported the first full week.';
    const { container } = render(
      <div>
        <ContentChartState state='empty' message='Streams appear here soon.' />
        <ContentChartState
          state='empty'
          title='No listener data yet'
          message={longMessage}
        />
        <div dir='rtl' lang='ar'>
          <ContentChartFrame testId='rtl-frame'>
            <p>تعذر تحميل بيانات الاستماع.</p>
          </ContentChartFrame>
        </div>
      </div>
    );

    const [partial] = screen.getAllByRole('status');
    expect(partial.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByText(longMessage)).toBeInTheDocument();
    expect(screen.getByTestId('rtl-frame')).toHaveTextContent(
      'تعذر تحميل بيانات الاستماع.'
    );
    await expectNoA11yViolations(container);
  });
});
