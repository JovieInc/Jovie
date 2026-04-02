import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockTask = {
  id: 'task-1',
  taskNumber: 1,
  creatorProfileId: 'profile-1',
  title:
    'Upload final master to distributor with long metadata review and delivery notes',
  description: 'Document the release handoff and delivery checklist.',
  status: 'done',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'approved',
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: null,
  releaseTitle: null,
  parentTaskId: null,
  category: null,
  scheduledFor: null,
  startedAt: null,
  completedAt: '2026-04-01T00:00:00.000Z',
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
} as const;

const mockTaskTwo = {
  ...mockTask,
  id: 'task-2',
  taskNumber: 2,
  title: 'Confirm final DSP delivery checklist',
  description: 'Follow up on delivery status and confirm provider approval.',
  status: 'in_progress',
  agentStatus: 'processing',
  priority: 'medium',
} as const;

const mockCreateTask = vi.fn();
const mockUpdateTask = vi.fn();

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      id: 'profile-1',
      display_name: 'Tim White',
      username: 'timwhite',
      username_normalized: 'timwhite',
    },
  }),
}));

vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({
    setHeaderActions: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({
    data: [],
  }),
}));

vi.mock('@/lib/queries/useTasksQuery', () => ({
  useTasksQuery: () => ({
    data: { tasks: [mockTask, mockTaskTwo] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTaskQuery: (taskId: string | null) => ({
    data: taskId === 'task-1' ? mockTask : undefined,
  }),
}));

vi.mock('@/lib/queries/useTaskMutations', () => ({
  useCreateTaskMutation: () => ({
    mutateAsync: mockCreateTask,
    isPending: false,
  }),
  useUpdateTaskMutation: () => ({
    mutate: mockUpdateTask,
    isPending: false,
  }),
}));

vi.mock(
  '@/components/features/dashboard/atoms/DashboardHeaderActionButton',
  () => ({
    DashboardHeaderActionButton: ({ ariaLabel }: { ariaLabel: string }) => (
      <button type='button' aria-label={ariaLabel} />
    ),
  })
);

vi.mock('@/components/organisms/PageShell', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/organisms/PageShell')>();
  return {
    ...actual,
    PageShell: ({ children }: { children: React.ReactNode }) => (
      <div data-testid='page-shell'>{children}</div>
    ),
  };
});

vi.mock('@/components/organisms/table', () => ({
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS: '',
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS: '',
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS: '',
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS: '',
  PAGE_TOOLBAR_ICON_CLASS: '',
  PAGE_TOOLBAR_ICON_STROKE_WIDTH: 1.75,
  PageToolbar: ({ start }: { start: React.ReactNode }) => <div>{start}</div>,
  UnifiedTable: () => <div data-testid='tasks-table' />,
  convertContextMenuItems: vi.fn(() => []),
}));

vi.mock('@/components/atoms/table-action-menu/TableActionMenu', () => ({
  TableActionMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: () => null,
}));

const { TasksPageClient } = await import(
  '@/components/features/dashboard/tasks/TasksPageClient'
);

function renderPage() {
  return render(
    <TooltipProvider>
      <TasksPageClient />
    </TooltipProvider>
  );
}

describe('TasksPageClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateTask.mockReset();
    mockUpdateTask.mockReset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders a single unified filter menu button in the toolbar', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
    expect(screen.queryByText('All Priorities')).not.toBeInTheDocument();
    expect(screen.queryByText('All Assignees')).not.toBeInTheDocument();
  });

  it('renders the task title editor as a textarea for wrapping document headings', () => {
    renderPage();

    const titleEditor = screen.getByLabelText('Task title');
    expect(titleEditor.tagName).toBe('TEXTAREA');
    expect(titleEditor).toHaveValue(mockTask.title);
  });

  it('shows the compact progress metadata for the selected task', () => {
    renderPage();

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('autosaves document edits and removes the manual save button', () => {
    renderPage();

    expect(
      screen.queryByRole('button', { name: /save task/i })
    ).not.toBeInTheDocument();

    const titleEditor = screen.getByLabelText('Task title');
    fireEvent.change(titleEditor, {
      target: { value: 'Updated release handoff title' },
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockUpdateTask).toHaveBeenCalledWith(
      {
        taskId: 'task-1',
        data: {
          title: 'Updated release handoff title',
          description: mockTask.description,
        },
      },
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
  });

  it('renders previous and next task navigation controls', () => {
    renderPage();

    expect(
      screen.getByRole('button', { name: 'Previous task' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next task' })).toBeEnabled();
  });

  it('supports j and k keyboard navigation across visible tasks', () => {
    renderPage();

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTask.title);

    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);

    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTask.title);
  });
});
