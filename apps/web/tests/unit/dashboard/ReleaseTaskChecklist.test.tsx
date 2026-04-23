import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';

vi.mock('@/lib/queries/useReleaseTasksQuery', () => ({
  useReleaseTasksQuery: vi.fn(),
}));

vi.mock('@/lib/queries/useReleaseCatalogQuery', () => ({
  useReleaseTaskCatalogQuery: vi.fn(() => ({ data: [] })),
  useReleaseSkillClustersQuery: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/lib/queries/useReleaseTaskMutations', () => ({
  useInstantiateTasksMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useTaskToggleMutation: vi.fn(() => ({
    mutate: vi.fn(),
  })),
}));

function withQueryClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskCategoryGroup',
  () => ({
    ReleaseTaskCategoryGroup: ({
      category,
      children,
    }: {
      category: string;
      children: ReactNode;
    }) => (
      <section>
        <h2>{category}</h2>
        {children}
      </section>
    ),
  })
);

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskCompactRow',
  () => ({
    ReleaseTaskCompactRow: ({ task }: { task: ReleaseTaskView }) => (
      <div>{task.title}</div>
    ),
  })
);

vi.mock('@/components/features/dashboard/release-tasks/ReleaseTaskRow', () => ({
  ReleaseTaskRow: ({ task }: { task: ReleaseTaskView }) => (
    <div>{task.title}</div>
  ),
}));

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskProgressBar',
  () => ({
    ReleaseTaskProgressBar: ({
      done,
      total,
    }: {
      done: number;
      total: number;
    }) => <div>{`${done}/${total}`}</div>,
  })
);

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskEmptyState',
  () => ({
    ReleaseTaskEmptyState: () => <div>No tasks</div>,
  })
);

vi.mock(
  '@/components/features/dashboard/release-tasks/ReleaseTaskPastReleaseState',
  () => ({
    ReleaseTaskPastReleaseState: () => <div>Past release</div>,
  })
);

const { useReleaseTasksQuery } = await import(
  '@/lib/queries/useReleaseTasksQuery'
);
const { ReleaseTaskChecklist } = await import(
  '@/components/features/dashboard/release-tasks/ReleaseTaskChecklist'
);

function createTask(overrides: Partial<ReleaseTaskView> = {}): ReleaseTaskView {
  return {
    id: 'task_1',
    releaseId: 'release_1',
    creatorProfileId: 'profile_1',
    templateItemId: 'template_1',
    title: 'Submit to playlists',
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
    dueDate: new Date('2025-06-01T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2025-05-01T00:00:00.000Z'),
    updatedAt: new Date('2025-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReleaseTaskChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a dedicated scroll region in compact mode', () => {
    vi.mocked(useReleaseTasksQuery).mockReturnValue({
      data: [createTask()],
      isLoading: false,
    } as ReturnType<typeof useReleaseTasksQuery>);

    render(
      withQueryClient(
        <div className='h-80'>
          <ReleaseTaskChecklist releaseId='release_1' variant='compact' />
        </div>
      )
    );

    const scrollRegion = screen.getByTestId(
      'release-task-checklist-scroll-region'
    );

    expect(scrollRegion).toBeInTheDocument();
    expect(scrollRegion).toHaveAttribute('data-scroll-mode', 'internal');
    expect(scrollRegion).toHaveTextContent('Marketing');
    expect(scrollRegion).toHaveTextContent('Submit to playlists');
  });

  it('keeps full mode on the page layout without the compact scroll region', () => {
    vi.mocked(useReleaseTasksQuery).mockReturnValue({
      data: [createTask()],
      isLoading: false,
    } as ReturnType<typeof useReleaseTasksQuery>);

    render(
      withQueryClient(
        <ReleaseTaskChecklist releaseId='release_1' variant='full' />
      )
    );

    expect(
      screen.queryByTestId('release-task-checklist-scroll-region')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Submit to playlists')).toBeInTheDocument();
  });
});
