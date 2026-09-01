import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';

const { mockToggleMutate, mockUseReleaseTasksQuery } = vi.hoisted(() => ({
  mockToggleMutate: vi.fn(),
  mockUseReleaseTasksQuery: vi.fn(),
}));

vi.mock('@/lib/queries/useReleaseTasksQuery', () => ({
  useReleaseTasksQuery: mockUseReleaseTasksQuery,
}));

vi.mock('@/lib/queries/useReleaseTaskMutations', () => ({
  useTaskToggleMutation: vi.fn(() => ({ mutate: mockToggleMutate })),
}));

vi.mock(
  '@/components/features/dashboard/release-tasks/MetadataAgentPanel',
  () => ({
    MetadataAgentPanel: ({
      releaseTitle,
    }: {
      readonly releaseTitle: string;
    }) => <aside data-testid='metadata-agent-panel'>{releaseTitle}</aside>,
  })
);

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskChecklist',
  () => ({
    ReleaseTaskChecklist: ({ releaseId }: { readonly releaseId: string }) => (
      <div data-testid='release-task-checklist'>{releaseId}</div>
    ),
  })
);

vi.mock('@/components/features/dashboard/release-tasks/ReleaseTaskRow', () => ({
  ReleaseTaskRow: ({
    task,
    onToggle,
  }: {
    readonly task: ReleaseTaskView;
    readonly onToggle: (taskId: string, done: boolean) => void;
  }) => (
    <button type='button' onClick={() => onToggle(task.id, true)}>
      {task.title}
    </button>
  ),
}));

const { ReleaseTaskPage, ReleaseTaskPageSkeleton } = await import(
  '@/components/features/dashboard/release-tasks/ReleaseTaskPage'
);

function createTask(overrides: Partial<ReleaseTaskView> = {}): ReleaseTaskView {
  return {
    id: 'task_1',
    releaseId: 'release_1',
    creatorProfileId: 'profile_1',
    templateItemId: 'template_1',
    title: 'Pitch playlist editors',
    description: null,
    explainerText: null,
    learnMoreUrl: null,
    videoUrl: null,
    category: 'Marketing',
    status: 'todo',
    priority: 'medium',
    position: 1,
    assigneeType: 'human',
    assigneeUserId: null,
    aiWorkflowId: null,
    dueDaysOffset: 3,
    dueDate: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReleaseTaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReleaseTasksQuery.mockReturnValue({
      data: [
        createTask(),
        createTask({
          id: 'task_2',
          title: 'Completed setup',
          status: 'done',
          position: 2,
        }),
      ],
    });
  });

  it('renders release tasks with a canonical toolbar back link and release context', () => {
    render(
      <ReleaseTaskPage
        profileId='profile_1'
        releaseId='release_1'
        releaseTitle='The Deep End'
      />
    );

    expect(screen.getByTestId('release-task-page')).toHaveAttribute(
      'aria-label',
      'The Deep End tasks'
    );
    const toolbarContext = screen.getByTestId('release-task-toolbar-context');
    expect(
      within(toolbarContext).getByRole('link', { name: 'Back to releases' })
    ).toHaveAttribute('href', '/app/releases');
    expect(within(toolbarContext).getByText('The Deep End')).toHaveClass(
      'min-w-0',
      'truncate'
    );
    expect(within(toolbarContext).queryByText('Tasks')).not.toBeInTheDocument();
    expect(screen.getByTestId('release-task-checklist')).toHaveTextContent(
      'release_1'
    );
    expect(screen.getByText('Up next')).toBeVisible();
    expect(screen.getByText('Pitch playlist editors')).toBeVisible();
    expect(screen.queryByText('Completed setup')).not.toBeInTheDocument();

    expect(screen.getByTestId('release-task-up-next-card')).toHaveClass(
      'rounded-lg',
      'border',
      'border-(--app-shell-border)',
      'bg-surface-1',
      'p-1',
      'shadow-app-control'
    );
  });

  it('keeps metadata agent and task toggles wired through the shell frame', () => {
    render(
      <ReleaseTaskPage
        profileId='profile_1'
        releaseId='release_1'
        releaseTitle='The Deep End'
        showMetadataAgentPanel
      />
    );

    expect(screen.getByTestId('metadata-agent-panel')).toHaveTextContent(
      'The Deep End'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Pitch playlist editors' })
    );

    expect(mockToggleMutate).toHaveBeenCalledWith({
      taskId: 'task_1',
      done: true,
    });
  });

  it('keeps Up next ordered by due date, excludes cancelled tasks, and limits the list', () => {
    mockUseReleaseTasksQuery.mockReturnValue({
      data: [
        createTask({
          id: 'task_no_due_date',
          title: 'No due date',
          dueDate: null,
          position: 0,
        }),
        createTask({
          id: 'task_later',
          title: 'Later task',
          dueDate: new Date('2026-06-04T00:00:00.000Z'),
        }),
        createTask({
          id: 'task_first',
          title: 'First task',
          dueDate: new Date('2026-06-01T00:00:00.000Z'),
        }),
        createTask({
          id: 'task_middle',
          title: 'Middle task',
          dueDate: new Date('2026-06-02T00:00:00.000Z'),
        }),
        createTask({
          id: 'task_cancelled',
          title: 'Cancelled task',
          status: 'cancelled',
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ],
    });

    render(
      <ReleaseTaskPage
        profileId='profile_1'
        releaseId='release_1'
        releaseTitle='The Deep End'
      />
    );

    expect(
      within(screen.getByTestId('release-task-up-next-card'))
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['First task', 'Middle task', 'Later task']);
    expect(screen.queryByText('Cancelled task')).not.toBeInTheDocument();
    expect(screen.queryByText('No due date')).not.toBeInTheDocument();
  });

  it('omits Up next once every release task is complete', () => {
    mockUseReleaseTasksQuery.mockReturnValue({
      data: [createTask({ status: 'done' })],
    });

    render(
      <ReleaseTaskPage
        profileId='profile_1'
        releaseId='release_1'
        releaseTitle='The Deep End'
      />
    );

    expect(
      screen.queryByTestId('release-task-up-next-card')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('release-task-checklist')).toBeVisible();
  });

  it('renders the route skeleton with the same shell geometry', () => {
    render(<ReleaseTaskPageSkeleton />);

    expect(screen.getByLabelText('Loading release tasks')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      screen.getByTestId('release-task-skeleton-summary-card')
    ).toHaveClass(
      'rounded-lg',
      'border',
      'border-(--app-shell-border)',
      'bg-surface-1',
      'p-3',
      'shadow-app-control'
    );
  });
});
