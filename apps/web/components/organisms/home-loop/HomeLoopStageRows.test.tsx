import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import {
  HomeLoopDoneChips,
  HomeLoopStagePips,
  HomeLoopStageRows,
  HomeLoopStageRowsSkeleton,
} from './HomeLoopStageRows';

let restoreLayout: (() => void) | null = null;
afterEach(() => {
  restoreLayout?.();
  restoreLayout = null;
});

describe('HomeLoopStageRows', () => {
  it('lists rows with their stage named in text and a legend', async () => {
    const user = userEvent.setup();
    const rows = HOME_LOOP_FIXTURE_ROWS.map((row, index) =>
      index === 0
        ? { ...row, url: 'https://linear.app/jovie/issue/JOV-8711' }
        : row
    );
    const { container } = render(
      <HomeLoopStageRows stages={HOME_LOOP_FIXTURE_STAGES} rows={rows} />
    );

    const items = screen.getAllByTestId('home-loop-stage-row');
    expect(items).toHaveLength(rows.length);
    expect(items[0]).toHaveAttribute('data-attention', 'blocked');
    expect(
      within(items[0]).getByRole('list', {
        name: 'Stage 1 of 6: Investigating, Blocked',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Investigating → Building → Tested → Merging → Deployed → Verified'
      )
    ).toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Sign-in OTP failure' })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('caps the list and counts the rest', async () => {
    const { container } = render(
      <HomeLoopStageRows
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
        maxRows={2}
      />
    );

    expect(screen.getAllByTestId('home-loop-stage-row')).toHaveLength(2);
    expect(screen.getByText('4 more in flight')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows only the legend when nothing is in flight', async () => {
    const { container } = render(
      <HomeLoopStageRows stages={HOME_LOOP_FIXTURE_STAGES} rows={[]} />
    );

    expect(screen.queryAllByTestId('home-loop-stage-row')).toHaveLength(0);
    expect(screen.queryByText(/more in flight/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders a text-free skeleton with the requested row count', async () => {
    const { container } = render(<HomeLoopStageRowsSkeleton rows={3} />);

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.children).toHaveLength(4);
    await expectNoA11yViolations(container);
  });
});

describe('HomeLoopStagePips', () => {
  it('marks done, current and pending pips for a finished row', () => {
    const { container } = render(
      <HomeLoopStagePips
        stages={HOME_LOOP_FIXTURE_STAGES}
        row={{
          stage: 'verified',
          stageIndex: 5,
          complete: true,
          attention: null,
        }}
      />
    );
    const pips = Array.from(container.querySelectorAll('[data-pip]'));
    expect(pips.map(pip => pip.getAttribute('data-pip'))).toEqual(
      Array(6).fill('done')
    );
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});

describe('HomeLoopDoneChips', () => {
  it('names verified and landed work and links chips that have a URL', async () => {
    const user = userEvent.setup();
    const items = HOME_LOOP_FIXTURE_DONE.map((item, index) =>
      index === 0
        ? { ...item, url: 'https://github.com/JovieInc/Jovie/pull/22299' }
        : item
    );
    const { container } = render(
      <HomeLoopDoneChips items={items} summary='12 merges' />
    );

    expect(screen.getByText('12 merges')).toBeInTheDocument();
    expect(screen.getAllByText('Verified in production')).toHaveLength(2);
    expect(screen.getAllByText('Landed')).toHaveLength(1);
    await user.tab();
    expect(screen.getByRole('link', { name: /Codex Quota Bug/ })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('collapses chips that do not fit into "+N more"', async () => {
    restoreLayout = mockFitLayout('home-loop-done', 150);
    const { container } = render(
      <HomeLoopDoneChips items={HOME_LOOP_FIXTURE_DONE} summary={null} fit />
    );

    expect(screen.getByTestId('home-loop-done-more')).toHaveTextContent(
      '+2 more'
    );
    await expectNoA11yViolations(container);
  });
});
