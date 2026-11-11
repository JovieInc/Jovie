import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TasksRouteSkeleton } from './TasksRouteSkeleton';

describe('TasksRouteSkeleton', () => {
  it('renders the loading toolbar and row skeletons', async () => {
    const { container } = render(<TasksRouteSkeleton />);

    expect(screen.getByLabelText('Loading Tasks')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getAllByTestId('task-loading-row')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks');
    await expectNoA11yViolations(container);
  });

  it('keeps the same loading frame in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TasksRouteSkeleton />
      </div>
    );

    expect(screen.getAllByTestId('task-loading-row')).toHaveLength(5);
    await expectNoA11yViolations(container);
  });

  it('uses the single unified header-height token (founder lock 2026-09-25)', () => {
    const { container } = render(<TasksRouteSkeleton />);

    const toolbar = container.querySelector(
      '.h-\\(--app-shell-header-height\\)'
    );
    expect(toolbar).toBeTruthy();
    expect(
      container.querySelector('[class*="--app-shell-header-height-compact"]')
    ).toBeNull();
  });
});
