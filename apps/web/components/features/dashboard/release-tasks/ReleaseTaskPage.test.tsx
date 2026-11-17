import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  tasksQuery: vi.fn(),
}));

vi.mock('@/lib/queries/useReleaseTasksQuery', () => ({
  useReleaseTasksQuery: mocks.tasksQuery,
}));

vi.mock('@/lib/queries/useReleaseTaskMutations', () => ({
  useTaskToggleMutation: () => ({ mutate: mocks.toggle }),
}));

vi.mock('./MetadataAgentPanel', () => ({
  MetadataAgentPanel: ({
    profileId,
    releaseId,
    releaseTitle,
  }: {
    readonly profileId: string;
    readonly releaseId: string;
    readonly releaseTitle: string;
  }) => (
    <aside aria-label='Metadata agent'>
      {profileId} {releaseId} {releaseTitle}
    </aside>
  ),
}));

vi.mock('./ReleaseTaskChecklist', () => ({
  ReleaseTaskChecklist: ({
    releaseId,
    variant,
    releaseDate,
  }: {
    readonly releaseId: string;
    readonly variant: string;
    readonly releaseDate?: Date | string | null;
  }) => (
    <div
      data-testid='release-task-checklist'
      data-variant={variant}
      data-release-date={String(releaseDate ?? '')}
    >
      {releaseId}
    </div>
  ),
}));

import { ReleaseTaskPage, ReleaseTaskPageSkeleton } from './ReleaseTaskPage';

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

function renderPage(
  props: Partial<ComponentProps<typeof ReleaseTaskPage>> = {}
) {
  return render(
    <ReleaseTaskPage
      profileId='profile_1'
      releaseId='release_1'
      releaseTitle='The Deep End'
      releaseDate='2026-09-15'
      {...props}
    />
  );
}

describe('ReleaseTaskPage certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tasksQuery.mockReturnValue({
      data: [
        createTask(),
        createTask({
          id: 'task_2',
          title: 'Notify your core fans',
          position: 2,
          dueDate: new Date('2026-06-03T00:00:00.000Z'),
        }),
        createTask({ id: 'task_3', title: 'Finished setup', status: 'done' }),
      ],
    });
  });

  it('lists the next tasks and toggles one through the real row checkbox', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    expect(mocks.tasksQuery).toHaveBeenCalledWith('release_1');
    const upNext = screen.getByRole('region', { name: 'Up next' });
    expect(
      within(upNext)
        .getAllByRole('checkbox')
        .map(box => box.getAttribute('aria-label'))
    ).toEqual([
      'Mark "Pitch playlist editors" as complete',
      'Mark "Notify your core fans" as complete',
    ]);
    expect(within(upNext).queryByText('Finished setup')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to releases' })
    ).toHaveAttribute('href', '/app/releases');
    const checklist = screen.getByTestId('release-task-checklist');
    expect(checklist).toHaveTextContent('release_1');
    expect(checklist).toHaveAttribute('data-variant', 'full');
    expect(checklist).toHaveAttribute('data-release-date', '2026-09-15');
    await expectNoA11yViolations(container);

    await user.click(
      within(upNext).getByRole('checkbox', {
        name: 'Mark "Notify your core fans" as complete',
      })
    );
    expect(mocks.toggle).toHaveBeenCalledWith({ taskId: 'task_2', done: true });
  });

  it('shows the metadata agent panel only when asked', async () => {
    const { container, rerender } = renderPage({
      showMetadataAgentPanel: true,
    });
    expect(
      screen.getByRole('complementary', { name: 'Metadata agent' })
    ).toHaveTextContent('profile_1 release_1 The Deep End');
    await expectNoA11yViolations(container);

    rerender(
      <ReleaseTaskPage
        profileId='profile_1'
        releaseId='release_1'
        releaseTitle='The Deep End'
      />
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it.each([
    ['no tasks exist yet', []],
    ['the query has no data', undefined],
    [
      'every task is done',
      [
        createTask({ status: 'done' }),
        createTask({ id: 't2', status: 'done' }),
      ],
    ],
    ['only cancelled tasks remain', [createTask({ status: 'cancelled' })]],
  ])('hides Up next when %s', async (_case, data) => {
    mocks.tasksQuery.mockReturnValue({ data });
    const { container } = renderPage();

    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull();
    expect(screen.getByTestId('release-task-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('release-task-page')).toHaveAttribute(
      'aria-label',
      'The Deep End tasks'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long release title truncated with the full title on hover', async () => {
    const longTitle =
      'The Deep End (Tenth Anniversary Remastered Deluxe Edition with Bonus Live Sessions)';
    const { container } = renderPage({ releaseTitle: longTitle });

    const title = within(
      screen.getByTestId('release-task-toolbar-context')
    ).getByText(longTitle);
    expect(title).toHaveClass('truncate');
    expect(title).toHaveAttribute('title', longTitle);
    await expectNoA11yViolations(container);
  });

  it('announces the skeleton as busy', async () => {
    const { container } = render(<ReleaseTaskPageSkeleton />);

    expect(
      container.querySelector('[aria-label="Loading release tasks"]')
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByTestId('release-task-skeleton-summary-card')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
