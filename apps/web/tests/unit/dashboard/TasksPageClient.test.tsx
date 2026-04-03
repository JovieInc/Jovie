import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({
      children,
      className,
      onCloseAutoFocus: _onCloseAutoFocus,
      sideOffset: _sideOffset,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      className?: string;
      onCloseAutoFocus?: unknown;
      sideOffset?: unknown;
    }) => (
      <div role='menu' className={className} {...props}>
        {children}
      </div>
    ),
    DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuSubTrigger: ({
      children,
      className,
      inset: _inset,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      className?: string;
      inset?: unknown;
    }) => (
      <button type='button' className={className} {...props}>
        {children}
      </button>
    ),
    DropdownMenuSubContent: ({
      children,
      className,
      sideOffset: _sideOffset,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      className?: string;
      sideOffset?: unknown;
    }) => (
      <div role='menu' className={className} {...props}>
        {children}
      </div>
    ),
    DropdownMenuSeparator: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr {...props} />
    ),
    DropdownMenuItem: ({
      children,
      className,
      onSelect,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      className?: string;
      onSelect?: () => void;
    }) => (
      <button type='button' className={className} onClick={onSelect} {...props}>
        {children}
      </button>
    ),
    TooltipShortcut: ({ children }: { children: React.ReactNode }) => children,
  };
});

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
  releaseId: 'release-1',
  releaseTitle: 'QA Release',
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
const mockSetHeaderActions = vi.fn();
let setHeaderActionsHost: ((actions: React.ReactNode) => void) | null = null;
let mockIsXlUp = true;
let mockIs2xlUp = true;
let mockCanShowTaskDocumentAlongsideReleaseSidebar = true;

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
    setHeaderActions: (actions: React.ReactNode) => {
      mockSetHeaderActions(actions);
      setHeaderActionsHost?.(actions);
    },
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: (breakpoint: string) => {
    if (breakpoint === '2xl') {
      return mockIs2xlUp;
    }

    if (breakpoint === 'xl') {
      return mockIsXlUp;
    }

    return false;
  },
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockCanShowTaskDocumentAlongsideReleaseSidebar,
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({
    data: [{ id: 'release-1', title: 'QA Release' }],
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
    data:
      taskId === 'task-1'
        ? mockTask
        : taskId === 'task-2'
          ? mockTaskTwo
          : undefined,
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
    DashboardHeaderActionButton: ({
      ariaLabel,
      onClick,
      label,
    }: {
      ariaLabel: string;
      onClick?: () => void;
      label?: React.ReactNode;
    }) => (
      <button type='button' aria-label={ariaLabel} onClick={onClick}>
        {label}
      </button>
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
  PageToolbarActionButton: ({
    label,
    onClick,
    ariaLabel,
    disabled,
    icon,
  }: {
    label: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
  }) => (
    <button
      type='button'
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  ),
  PageToolbar: ({
    start,
    end,
  }: {
    start: React.ReactNode;
    end?: React.ReactNode;
  }) => (
    <div>
      {start}
      {end}
    </div>
  ),
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

function HeaderActionsHost() {
  const [actions, setActions] = React.useState<React.ReactNode>(null);

  React.useEffect(() => {
    setHeaderActionsHost = setActions;
    return () => {
      setHeaderActionsHost = null;
    };
  }, []);

  return <div data-testid='header-actions-host'>{actions}</div>;
}

function renderPage() {
  return render(
    <TooltipProvider>
      <HeaderActionsHost />
      <TasksPageClient />
    </TooltipProvider>
  );
}

describe('TasksPageClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateTask.mockReset();
    mockUpdateTask.mockReset();
    mockSetHeaderActions.mockReset();
    mockIsXlUp = true;
    mockIs2xlUp = true;
    mockCanShowTaskDocumentAlongsideReleaseSidebar = true;
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
    expect(titleEditor).toHaveValue(mockTaskTwo.title);
  });

  it('shows the compact progress metadata for the selected task', () => {
    renderPage();

    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
  });

  it('renders separate list and document scroll regions on desktop', () => {
    renderPage();

    expect(screen.getByTestId('task-list-pane')).toBeInTheDocument();
    expect(
      screen.getByTestId('task-document-scroll-region')
    ).toBeInTheDocument();
  });

  it('hides the task document when the right panel opens on constrained desktop widths', () => {
    mockCanShowTaskDocumentAlongsideReleaseSidebar = false;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'QA Release' }));

    expect(screen.getByTestId('task-document-pane')).toHaveClass('hidden');
    expect(screen.getByTestId('tasks-table')).toBeInTheDocument();
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
        taskId: 'task-2',
        data: {
          title: 'Updated release handoff title',
          description: mockTaskTwo.description,
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

  it('promotes the header into search mode when search is triggered', () => {
    renderPage();

    expect(
      screen.queryByRole('searchbox', { name: 'Search tasks' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search tasks' }));

    expect(
      screen.getByRole('searchbox', { name: 'Search tasks' })
    ).toBeInTheDocument();
  });

  it('promotes the header into create mode when new task is triggered', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(screen.getByLabelText('New task name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders task property menus with shared menu contracts and selected rows', () => {
    renderPage();

    const surface = document.querySelector('[data-menu-surface="toolbar"]');
    expect(surface).toBeTruthy();

    const menuRows = Array.from(
      (surface as HTMLElement).querySelectorAll('[data-menu-row]')
    );

    expect(menuRows.length).toBeGreaterThan(0);
    expect(menuRows.some(row => row.textContent?.includes('In Progress'))).toBe(
      true
    );
  });

  it('supports j and k keyboard navigation across visible tasks', () => {
    renderPage();

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);

    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTask.title);

    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);
  });

  it('does not auto-select a task on narrower layouts', () => {
    mockIsXlUp = false;

    renderPage();

    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-task-list')).toBeInTheDocument();
  });

  it('renders the mobile list shell and opens task detail on tap', () => {
    mockIsXlUp = false;

    renderPage();

    expect(screen.getByText('2 total tasks')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search tasks' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('mobile-task-row')[0]!);

    expect(screen.getByLabelText('Task title')).toBeInTheDocument();
  });
});
