import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskListRow } from '@/components/features/dashboard/tasks/TaskListRow';
import { fastRender } from '@/tests/utils/fast-render';

const mockTask = {
  id: 'task-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title:
    'Upload final master to distributor with long metadata review and delivery notes',
  description: null,
  status: 'in_progress',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'processing',
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
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
} as const;

describe('TaskListRow', () => {
  it('keeps long titles truncated and metadata in a wrapping flex row', () => {
    const { getByText, getByTestId } = fastRender(
      <TaskListRow
        task={mockTask}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );

    expect(getByText(mockTask.title)).toHaveClass('truncate');

    const meta = getByTestId('task-list-row-meta-task-1');
    expect(meta.className).toContain('flex-wrap');
    expect(meta.className).not.toContain('grid-cols-');
  });

  it('keeps the release link clickable and marks the selected state on the row shell', () => {
    const onOpenRelease = vi.fn();
    const { getByRole, getByTestId } = fastRender(
      <TaskListRow
        task={mockTask}
        artistName='Tim White'
        onOpenRelease={onOpenRelease}
        isSelected
      />
    );

    fireEvent.click(getByRole('button', { name: 'QA Release' }));

    expect(onOpenRelease).toHaveBeenCalledWith(mockTask);
    expect(getByTestId('task-list-row-task-1')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });
});
