import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskWorkspaceLoadingRows } from './TaskWorkspaceLoadingRows';

describe('TaskWorkspaceLoadingRows', () => {
  it('announces a busy loading status with five placeholder rows', async () => {
    const { container } = render(<TaskWorkspaceLoadingRows />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading tasks');
    expect(screen.getAllByTestId('task-loading-row')).toHaveLength(5);
    await expectNoA11yViolations(container);
  });

  it('keeps every skeleton bar out of the accessibility tree', () => {
    render(<TaskWorkspaceLoadingRows />);
    for (const bar of screen
      .getByTestId('task-workspace-loading-rows')
      .querySelectorAll('.skeleton')) {
      expect(bar).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
