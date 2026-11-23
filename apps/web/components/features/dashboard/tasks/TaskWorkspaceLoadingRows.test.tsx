import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

describe('TaskWorkspaceLoadingRows seam', () => {
  it('puts its content on the 12px workspace seam (JOV-12565)', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceLoadingRows.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "'flex min-h-0 flex-1 flex-col gap-1.5 pb-2 pt-0.5"
    );
    expect(source).not.toContain('gap-1.5 px-2.5');
  });
});
