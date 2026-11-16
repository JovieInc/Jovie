import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_BUSY_ROWS,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import { HomeLoopKanban, HomeLoopKanbanSkeleton } from './HomeLoopKanban';

let restoreLayout: (() => void) | null = null;
afterEach(() => {
  restoreLayout?.();
  restoreLayout = null;
});

describe('HomeLoopKanban certificate', () => {
  it('reaches a linked card from the keyboard and opens it in a new tab', async () => {
    const user = userEvent.setup();
    const rows = HOME_LOOP_FIXTURE_ROWS.map((row, index) =>
      index === 0
        ? { ...row, url: 'https://linear.app/jovie/issue/JOV-8711' }
        : row
    );
    const { container } = render(
      <HomeLoopKanban stages={HOME_LOOP_FIXTURE_STAGES} rows={rows} />
    );

    await user.tab();
    const link = screen.getByRole('link', { name: 'Sign-in OTP failure' });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute(
      'href',
      'https://linear.app/jovie/issue/JOV-8711'
    );
    await expectNoA11yViolations(container);
  });

  it('names attention in text on the card', async () => {
    const { container } = render(
      <HomeLoopKanban
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
      />
    );

    const investigating = screen.getByRole('region', {
      name: 'Investigating: 1',
    });
    const card = within(investigating).getByTestId('home-loop-kanban-card');
    expect(card).toHaveAttribute('data-attention', 'blocked');
    expect(within(card).getByText('Blocked')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps every lane frame with a zero count when nothing is in flight', async () => {
    const { container } = render(
      <HomeLoopKanban stages={HOME_LOOP_FIXTURE_STAGES} rows={[]} />
    );

    expect(screen.getAllByTestId('home-loop-kanban-lane')).toHaveLength(
      HOME_LOOP_FIXTURE_STAGES.length
    );
    expect(screen.queryByTestId('home-loop-kanban-card')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('links the overflow line to the full list and tabs onto it', async () => {
    const user = userEvent.setup();
    restoreLayout = mockFitLayout('home-loop-kanban-cards', 100);
    const { container } = render(
      <HomeLoopKanban
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_BUSY_ROWS}
        moreHref='/app/ov/shipping'
      />
    );

    const more = screen.getAllByTestId('home-loop-kanban-more')[0];
    expect(more).toHaveAttribute('href', '/app/ov/shipping');
    expect(more.textContent).toMatch(/^\+\d+ more$/);
    await user.tab();
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'home-loop-kanban-more'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the skeleton without any text', () => {
    const { container } = render(<HomeLoopKanbanSkeleton />);
    expect(container.textContent).toBe('');
  });
});
