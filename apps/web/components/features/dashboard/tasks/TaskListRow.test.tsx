import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskView } from '@/lib/tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskListRow } from './TaskListRow';

const task: TaskView = {
  id: 'task-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title: 'Upload final master to distributor',
  description: null,
  status: 'in_progress',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'idle',
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: 'release-1',
  releaseTitle: 'QA Release',
  parentTaskId: null,
  category: null,
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('TaskListRow', () => {
  it('opens the release from its button without activating the row', async () => {
    const user = userEvent.setup();
    const onOpenRelease = vi.fn();
    const onRowClick = vi.fn();
    // A click that bubbles past the row would reach the document body.
    document.body.addEventListener('click', onRowClick);
    const { container } = render(
      <TaskListRow task={task} onOpenRelease={onOpenRelease} />
    );

    await user.click(screen.getByRole('button', { name: /QA Release/ }));
    document.body.removeEventListener('click', onRowClick);
    expect(onOpenRelease).toHaveBeenCalledWith(task);
    expect(onRowClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('omits the release button when the task has no release', async () => {
    const { container } = render(
      <TaskListRow
        task={{ ...task, releaseId: null, releaseTitle: null }}
        onOpenRelease={vi.fn()}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('J-12')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('hides the title when the detail pane owns it', () => {
    render(<TaskListRow task={task} hideTitle onOpenRelease={vi.fn()} />);
    expect(screen.queryByText(task.title)).toBeNull();
  });

  it('uses the canonical content-row recipe', () => {
    render(<TaskListRow task={task} onOpenRelease={vi.fn()} />);
    const row = screen.getByTestId('task-list-row-task-1');
    expect(row).toHaveClass('min-h-11', 'px-3');
    expect(screen.getByText(task.title)).toHaveClass('font-medium');
    expect(screen.getByText(task.title)).not.toHaveClass('font-semibold');
    expect(screen.getByTestId('task-list-row-meta-task-1')).toHaveClass(
      'text-2xs'
    );
  });

  it('shows identifierLabel in place of the J-number and keeps J-number by default', () => {
    const { unmount } = render(
      <TaskListRow
        task={task}
        identifierLabel='JOV-123'
        onOpenRelease={vi.fn()}
      />
    );
    expect(screen.getByText('JOV-123')).toBeInTheDocument();
    expect(screen.queryByText('J-12')).toBeNull();
    unmount();

    render(<TaskListRow task={task} onOpenRelease={vi.fn()} />);
    expect(screen.getByText('J-12')).toBeInTheDocument();
  });
});
