import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  tasksQuery: vi.fn(),
  clustersQuery: vi.fn(),
  instantiate: vi.fn(),
  toggle: vi.fn(),
  instantiatePending: { value: false },
}));

vi.mock('@/lib/queries/useReleaseTasksQuery', () => ({
  useReleaseTasksQuery: mocks.tasksQuery,
}));

vi.mock('@/lib/queries/useReleaseCatalogQuery', () => ({
  useReleaseTaskCatalogQuery: () => ({ data: [] }),
  useReleaseSkillClustersQuery: mocks.clustersQuery,
}));

vi.mock('@/lib/queries/useReleaseTaskMutations', () => ({
  useInstantiateTasksMutation: () => ({
    mutate: mocks.instantiate,
    isPending: mocks.instantiatePending.value,
  }),
  useTaskToggleMutation: () => ({ mutate: mocks.toggle }),
}));

vi.mock('./CatalogTaskBuilderDialog', () => ({
  CatalogTaskBuilderDialog: ({ onClose }: { onClose: () => void }) => (
    <div role='dialog' aria-label='Add From Catalog'>
      <button type='button' onClick={onClose}>
        Close catalog
      </button>
    </div>
  ),
}));

const { ReleaseTaskChecklist } = await import('./ReleaseTaskChecklist');

function task(overrides: Partial<ReleaseTaskView> = {}): ReleaseTaskView {
  return {
    id: 'task-pitch',
    releaseId: 'release-1',
    creatorProfileId: 'profile-1',
    templateItemId: 'template-1',
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
    dueDate: new Date('2026-09-10T00:00:00.000Z'),
    completedAt: null,
    metadata: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function withTasks(data: ReleaseTaskView[] | undefined, isLoading = false) {
  mocks.tasksQuery.mockReturnValue({ data, isLoading });
}

describe('ReleaseTaskChecklist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
    mocks.clustersQuery.mockReturnValue({ data: [] });
    mocks.instantiatePending.value = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows a skeleton while tasks load', async () => {
    withTasks(undefined, true);
    const { container } = render(
      wrap(<ReleaseTaskChecklist releaseId='release-1' variant='full' />)
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('offers to generate a plan when an upcoming release has no tasks', async () => {
    const user = userEvent.setup();
    withTasks([]);
    const { container } = render(
      wrap(
        <ReleaseTaskChecklist
          releaseId='release-1'
          variant='full'
          releaseDate='2026-10-01'
        />
      )
    );

    expect(screen.getByTestId('release-task-empty-state')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Generate Release Plan' })
    );
    expect(mocks.instantiate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the past-release state when the query failed for a released record', async () => {
    const user = userEvent.setup();
    withTasks(undefined);
    const { container } = render(
      wrap(
        <ReleaseTaskChecklist
          releaseId='release-1'
          variant='compact'
          releaseDate='2026-08-01'
        />
      )
    );

    expect(
      screen.getByTestId('release-task-empty-state-compact')
    ).toHaveTextContent('This release is already out');
    await user.click(
      screen.getByRole('button', { name: 'Generate Release Plan Anyway' })
    );
    expect(mocks.instantiate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('groups tasks, toggles one and opens the catalog builder', async () => {
    const user = userEvent.setup();
    mocks.clustersQuery.mockReturnValue({
      data: [{ id: 1, slug: 'pitching', displayName: 'Pitching' }],
    });
    withTasks([
      task(),
      task({
        id: 'task-fans',
        title: 'Notify your core fans',
        category: null,
        status: 'done',
      }),
    ]);
    const { container } = render(
      wrap(<ReleaseTaskChecklist releaseId='release-1' variant='full' />)
    );

    expect(screen.getByTestId('release-task-checklist')).toBeVisible();
    expect(screen.getByRole('button', { name: /Marketing/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Other/ })).toBeVisible();

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Mark "Pitch playlist editors" as complete',
      })
    );
    expect(mocks.toggle).toHaveBeenCalledWith({
      taskId: 'task-pitch',
      done: true,
    });

    await user.click(screen.getByTestId('open-catalog-builder'));
    expect(
      await screen.findByRole('dialog', { name: 'Add From Catalog' })
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close catalog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('links the compact checklist to the full page', async () => {
    const user = userEvent.setup();
    const onNavigateToFullPage = vi.fn();
    const onNavigateToTask = vi.fn();
    withTasks([task()]);
    const { container } = render(
      wrap(
        <ReleaseTaskChecklist
          releaseId='release-1'
          variant='compact'
          onNavigateToFullPage={onNavigateToFullPage}
          onNavigateToTask={onNavigateToTask}
        />
      )
    );

    expect(
      screen.queryByTestId('open-catalog-builder')
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open →' }));
    expect(onNavigateToFullPage).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: /Pitch playlist editors/ })
    );
    expect(onNavigateToTask).toHaveBeenCalledWith('task-pitch');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with Arabic tasks in a right-to-left document', async () => {
    withTasks([
      task({ title: 'تواصل مع محرري قوائم التشغيل', category: 'التسويق' }),
    ]);
    const { container } = render(
      wrap(
        <div dir='rtl' lang='ar'>
          <ReleaseTaskChecklist releaseId='release-1' variant='full' />
        </div>
      )
    );

    expect(screen.getByText('تواصل مع محرري قوائم التشغيل')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
