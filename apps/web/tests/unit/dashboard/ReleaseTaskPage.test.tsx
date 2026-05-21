import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders release tasks inside the canonical page shell toolbar', () => {
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
    expect(screen.getByText('Releases')).toBeVisible();
    expect(screen.getByText('The Deep End')).toBeVisible();
    expect(screen.getByText('Tasks')).toBeVisible();
    expect(screen.getByTestId('release-task-checklist')).toHaveTextContent(
      'release_1'
    );
    expect(screen.getByText('Up next')).toBeVisible();
    expect(screen.getByText('Pitch playlist editors')).toBeVisible();
    expect(screen.queryByText('Completed setup')).not.toBeInTheDocument();
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

  it('renders the route skeleton with the same shell geometry', () => {
    render(<ReleaseTaskPageSkeleton />);

    expect(screen.getByLabelText('Loading release tasks')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
