import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockTask = {
  id: 'task-1',
  profileId: 'profile-1',
  taskNumber: 1,
  title:
    'Upload final master to distributor with long metadata review and delivery notes',
  description: 'Document the release handoff and delivery checklist.',
  status: 'done',
  priority: 'high',
  assigneeKind: 'human',
  dueAt: null,
  releaseId: null,
  releaseTitle: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
} as const;

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
    data: { tasks: [mockTask] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTaskQuery: () => ({
    data: mockTask,
  }),
}));

vi.mock('@/lib/queries/useTaskMutations', () => ({
  useCreateTaskMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateTaskMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
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
});
