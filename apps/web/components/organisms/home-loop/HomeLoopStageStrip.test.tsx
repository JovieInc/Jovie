import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HOME_LOOP_FIXTURE_STRIP } from './fixtures';
import { HomeLoopStageStrip } from './HomeLoopStageStrip';

describe('HomeLoopStageStrip', () => {
  it('names the strip and colours values by tone', async () => {
    const { container } = render(
      <HomeLoopStageStrip
        title='Stage Time'
        items={HOME_LOOP_FIXTURE_STRIP}
        coverage='14 of 31 stages measured'
        emptyLabel='Not measured'
      />
    );

    expect(screen.getByRole('region', { name: 'Stage Time' })).toBeVisible();
    const items = screen.getAllByTestId('home-loop-strip-item');
    expect(items).toHaveLength(HOME_LOOP_FIXTURE_STRIP.length);
    expect(screen.getByText('57m / 3.0d')).toHaveClass('text-error-text');
    expect(screen.getByText('6.1d')).toHaveClass('text-warning-text');
    expect(screen.getByText('2.9h')).toHaveClass('text-primary-token');
    expect(screen.getByText('14 of 31 stages measured')).toBeInTheDocument();
    expect(screen.queryByText('Not measured')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the empty label and no items when nothing is measured', async () => {
    const { container } = render(
      <HomeLoopStageStrip
        title='Stage Time'
        items={[]}
        coverage={null}
        emptyLabel='Not measured'
      />
    );

    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryAllByTestId('home-loop-strip-item')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });
});
