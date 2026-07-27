import { fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(getByTestId('task-list-row-task-1').className).toContain(
      'system-b-table-row-selected'
    );
  });

  it('renders shell due metadata inline inside the wrapping meta row', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));

    const { getByText, getByTestId } = fastRender(
      <TaskListRow
        task={{
          ...mockTask,
          dueAt: new Date('2026-04-26T12:00:00.000Z'),
        }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );

    const dueChip = getByText('Due tomorrow').closest('span');
    expect(dueChip).toHaveClass('uppercase');
    expect(dueChip?.parentElement?.className).toContain('h-5');
    // The due chip now lives in the inline meta row, not a separate right rail.
    expect(getByTestId('task-list-row-meta-task-1')).toContainElement(
      dueChip as HTMLElement
    );
  });

  it('renders a Title-Cased category label when present and nothing when absent', () => {
    const withCategory = fastRender(
      <TaskListRow
        task={{ ...mockTask, category: 'distribution' }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );
    expect(
      within(withCategory.container).getByText('Distribution')
    ).toBeInTheDocument();

    const withoutCategory = fastRender(
      <TaskListRow
        task={{ ...mockTask, category: null }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );
    expect(
      within(withoutCategory.container).queryByText('Distribution')
    ).toBeNull();
  });

  it('hides the assignee chip when the assignee subview already scopes the list', () => {
    const { queryByText } = fastRender(
      <TaskListRow
        task={mockTask}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
        showAssignee={false}
      />
    );

    expect(queryByText('Me')).not.toBeInTheDocument();
  });

  it('hides the title and due chip when the detail pane already shows them', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));

    const { queryByText } = fastRender(
      <TaskListRow
        task={{
          ...mockTask,
          dueAt: new Date('2026-04-20T12:00:00.000Z'),
        }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
        isSelected
        hideTitle
        hideDue
      />
    );

    expect(queryByText(mockTask.title)).not.toBeInTheDocument();
    expect(queryByText(/due/i)).not.toBeInTheDocument();
  });

  it('shows the agent-working glyph only for live Jovie in-progress work', () => {
    const working = fastRender(
      <TaskListRow
        task={{
          ...mockTask,
          assigneeKind: 'jovie',
          status: 'in_progress',
          agentStatus: 'drafting',
        }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );
    expect(
      within(working.container).getByText('Jovie working')
    ).toBeInTheDocument();

    const human = fastRender(
      <TaskListRow
        task={{ ...mockTask, assigneeKind: 'human', agentStatus: 'idle' }}
        artistName='Tim White'
        onOpenRelease={vi.fn()}
      />
    );
    expect(within(human.container).queryByText('Jovie working')).toBeNull();
  });
});
