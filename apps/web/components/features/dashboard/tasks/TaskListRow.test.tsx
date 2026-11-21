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
    const { container } = render(
      // biome-ignore lint/a11y/noStaticElementInteractions: row click bubbling probe
      // biome-ignore lint/a11y/useKeyWithClickEvents: row click bubbling probe
      <div onClick={onRowClick}>
        <TaskListRow task={task} onOpenRelease={onOpenRelease} />
      </div>
    );

    await user.click(screen.getByRole('button', { name: /QA Release/ }));
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
});
