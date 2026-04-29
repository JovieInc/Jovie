import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskView } from '@/lib/tasks/types';

const { mockRegisterRightPanel, mockUseAppFlag } = vi.hoisted(() => ({
  mockRegisterRightPanel: vi.fn(),
  mockUseAppFlag: vi.fn(),
}));

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

const mockJovieTask = {
  ...mockTask,
  id: 'task-jovie',
  taskNumber: 3,
  title: 'Review release plan in Jovie',
  description: 'Let Jovie review release positioning.',
  status: 'todo',
  agentStatus: 'queued',
  priority: 'low',
  assigneeKind: 'jovie',
  releaseId: null,
  releaseTitle: null,
} as const;

const mockTaskDescriptionHelper = {
  title: 'Press Release',
  intro: [
    'Start drafting your press release here, or tag @Jovie and ask her to draft a first pass for you.',
  ],
  bullets: [
    'What is being announced',
    'Why this release matters now',
    'Release date and key context',
  ],
  links: [
    {
      label: 'UnitedMasters Promote Tab',
      href: 'https://support.unitedmasters.com/hc/en-us/articles/4407142673299-How-do-I-promote-my-music-using-UnitedMasters',
    },
  ],
  footer: 'Keep it tight. One page is enough.',
} as const;

const mockHelperTask = {
  ...mockTask,
  id: 'task-helper',
  taskNumber: 3,
  title: 'Draft press release',
  description: null,
  status: 'todo',
  priority: 'medium',
  category: 'Press',
  sourceTemplateId: 'template-press-release',
  metadata: {
    descriptionHelper: mockTaskDescriptionHelper,
  },
} as const;

const mockCreateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockSetHeaderActions = vi.fn();
let setHeaderActionsHost: ((actions: React.ReactNode) => void) | null = null;
let mockIsXlUp = true;
let mockIs2xlUp = true;
let mockTasksData = [mockTask, mockTaskTwo];
let mockCanShowTaskDocumentAlongsideReleaseSidebar = true;
const mockUnifiedTable = vi.fn();

function setHeaderActionsForTest(actions: React.ReactNode) {
  mockSetHeaderActions(actions);
  setHeaderActionsHost?.(actions);
}

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
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
    setHeaderActions: setHeaderActionsForTest,
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: mockRegisterRightPanel,
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: mockUseAppFlag,
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
    data: { tasks: mockTasksData },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTaskQuery: (taskId: string | null) => ({
    data: mockTasksData.find(task => task.id === taskId),
  }),
}));

vi.mock('@/lib/queries/useTaskMutations', () => ({
  useCreateTaskMutation: () => ({
    mutateAsync: mockCreateTask,
    isPending: false,
  }),
  useDeleteTaskMutation: () => ({
    mutate: mockDeleteTask,
    mutateAsync: mockDeleteTask,
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
    PageShell: ({
      children,
      toolbar,
    }: {
      children: React.ReactNode;
      toolbar?: React.ReactNode;
    }) => (
      <div data-testid='page-shell'>
        <div data-testid='dashboard-header' />
        {toolbar}
        {children}
      </div>
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
    iconOnly,
  }: {
    label: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    iconOnly?: boolean;
  }) => (
    <button
      type='button'
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {icon}
      {iconOnly ? <span className='sr-only'>{label}</span> : label}
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
  UnifiedTable: (props: { minWidth?: string; containerClassName?: string }) => {
    mockUnifiedTable(props);
    return (
      <div
        data-testid='tasks-table'
        data-min-width={props.minWidth ?? ''}
        data-container-class-name={props.containerClassName ?? ''}
      />
    );
  },
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

function getLatestTableProps() {
  return mockUnifiedTable.mock.calls.at(-1)?.[0] as
    | {
        readonly data?: ReadonlyArray<TaskView>;
        readonly onRowClick?: (task: TaskView) => void;
        readonly getContextMenuItems?: (task: TaskView) => ReadonlyArray<{
          readonly id?: string;
          readonly label?: string;
          readonly destructive?: boolean;
          readonly onClick?: () => void;
        }>;
      }
    | undefined;
}

function enableDesignV1Tasks() {
  mockUseAppFlag.mockImplementation(flagName => flagName === 'DESIGN_V1_TASKS');
}

describe('TasksPageClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateTask.mockReset();
    mockDeleteTask.mockReset();
    mockUpdateTask.mockReset();
    mockSetHeaderActions.mockReset();
    mockRegisterRightPanel.mockReset();
    mockUseAppFlag.mockReturnValue(false);
    mockUnifiedTable.mockReset();
    mockIsXlUp = true;
    mockIs2xlUp = true;
    mockTasksData = [mockTask, mockTaskTwo];
    mockCanShowTaskDocumentAlongsideReleaseSidebar = true;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders a single unified filter menu button in the toolbar', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
    expect(screen.queryByText('All Priorities')).not.toBeInTheDocument();
    expect(screen.queryByText('All Assignees')).not.toBeInTheDocument();
  });

  it('filters desktop tasks through the assignee subview tabs', () => {
    mockTasksData = [mockTask, mockTaskTwo, mockJovieTask];

    renderPage();

    expect(screen.getByRole('tab', { name: 'All 3' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));

    const tableProps = mockUnifiedTable.mock.calls.at(-1)?.[0] as
      | {
          readonly data?: ReadonlyArray<typeof mockTask>;
        }
      | undefined;

    expect(
      screen.getByRole('tab', { name: 'Assigned To Jovie 1' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(tableProps?.data?.map(task => task.id)).toEqual(['task-jovie']);
  });

  it('keeps DESIGN_V1_TASKS desktop unselected until the user opens a task', () => {
    enableDesignV1Tasks();

    renderPage();

    expect(screen.getByTestId('task-document-pane')).toBeInTheDocument();
    expect(
      screen.getByText('Pick a task from the list to see what it needs.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();

    act(() => {
      getLatestTableProps()?.onRowClick?.(mockTaskTwo);
    });

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);
  });

  it('resets the DESIGN_V1_TASKS detail selection when subview filters exclude the selected task', () => {
    enableDesignV1Tasks();
    mockTasksData = [mockTaskTwo, mockJovieTask];

    renderPage();

    act(() => {
      getLatestTableProps()?.onRowClick?.(mockTaskTwo);
    });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));

    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
    expect(
      screen.getByText('Pick a task from the list to see what it needs.')
    ).toBeInTheDocument();
    expect(getLatestTableProps()?.data?.map(task => task.id)).toEqual([
      'task-jovie',
    ]);
  });

  it('keeps all assignee subviews wired under DESIGN_V1_TASKS', () => {
    enableDesignV1Tasks();
    mockTasksData = [mockTask, mockTaskTwo, mockJovieTask];

    renderPage();

    expect(getLatestTableProps()?.data?.map(task => task.id)).toEqual([
      'task-2',
      'task-jovie',
      'task-1',
    ]);

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Me 2' }));
    expect(getLatestTableProps()?.data?.map(task => task.id)).toEqual([
      'task-2',
      'task-1',
    ]);

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));
    expect(getLatestTableProps()?.data?.map(task => task.id)).toEqual([
      'task-jovie',
    ]);

    fireEvent.click(screen.getByRole('tab', { name: 'All 3' }));
    expect(getLatestTableProps()?.data?.map(task => task.id)).toEqual([
      'task-2',
      'task-jovie',
      'task-1',
    ]);
  });

  it('renders the task title editor as a textarea for wrapping document headings', () => {
    renderPage();

    const titleEditor = screen.getByLabelText('Task title');
    expect(titleEditor.tagName).toBe('TEXTAREA');
    expect(titleEditor).toHaveValue(mockTaskTwo.title);
  });

  it('keeps the tasks subheader at the same compact header height as the page header', () => {
    renderPage();

    const pageHeader = screen.getByTestId('dashboard-header');
    const subheader = screen.getByTestId('tasks-workspace-subheader');

    expect(subheader.getBoundingClientRect().height).toBe(
      pageHeader.getBoundingClientRect().height
    );
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

  it('pins the tasks table to the pane width instead of inheriting a wider table minimum', () => {
    renderPage();

    expect(screen.getByTestId('tasks-table')).toHaveAttribute(
      'data-min-width',
      '100%'
    );
    expect(screen.getByTestId('tasks-table')).toHaveAttribute(
      'data-container-class-name',
      'h-full overflow-y-auto overflow-x-hidden px-2.5 pb-2 pt-0.5'
    );
  });

  it('hides the task document when the right panel opens on constrained desktop widths', () => {
    mockCanShowTaskDocumentAlongsideReleaseSidebar = false;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'QA Release' }));

    expect(screen.getByTestId('task-document-pane')).toHaveClass('hidden');
    expect(screen.getByTestId('tasks-table')).toBeInTheDocument();
  });

  it('registers the release side panel from the selected task document', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'QA Release' }));

    expect(mockRegisterRightPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: expect.any(Function),
      })
    );
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

  it('shows the empty-description helper for supported release tasks', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    expect(screen.getByTestId('task-description-helper')).toBeInTheDocument();
    expect(screen.getByText('Press Release')).toBeInTheDocument();
    expect(
      screen.getByText(/tag @Jovie and ask her to draft a first pass/i)
    ).toBeInTheDocument();
  });

  it('does not show the helper when the selected task already has a description', () => {
    renderPage();

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toHaveValue(
      mockTaskTwo.description
    );
  });

  it('does not show the helper for manual empty-description tasks', () => {
    mockTasksData = [
      {
        ...mockTask,
        id: 'manual-task',
        description: null,
        releaseId: null,
        releaseTitle: null,
        metadata: null,
      },
      mockTask,
    ];

    renderPage();

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toBeInTheDocument();
  });

  it('hides the helper when the user clicks into the helper body', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    fireEvent.click(screen.getByTestId('task-description-helper'));

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toBeInTheDocument();
  });

  it('shows the helper for existing release tasks without helper metadata', () => {
    mockTasksData = [
      {
        ...mockHelperTask,
        metadata: {
          dueDaysOffset: -21,
        },
      },
      mockTask,
    ];

    renderPage();

    expect(screen.getByTestId('task-description-helper')).toBeInTheDocument();
    expect(screen.getByText('Press Release')).toBeInTheDocument();
  });

  it('hides the helper when the description editor receives focus', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    fireEvent.focus(screen.getByLabelText('Task description'));

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
  });

  it('hides the helper and keeps typed text in the editor', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    const editor = screen.getByLabelText('Task description');

    fireEvent.focus(editor);
    fireEvent.change(editor, {
      target: {
        value: 'H',
      },
    });

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toHaveValue('H');
  });

  it('hides the helper before pasted text is written into the editor', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    const editor = screen.getByLabelText('Task description');

    fireEvent.focus(editor);
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => (type === 'text' ? 'Press copy' : ''),
      },
    });
    fireEvent.change(editor, {
      target: {
        value: 'Press copy',
      },
    });

    expect(
      screen.queryByTestId('task-description-helper')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toHaveValue('Press copy');
  });

  it('does not dirty the editor when a helper link is clicked', () => {
    mockTasksData = [mockHelperTask, mockTask];

    renderPage();

    fireEvent.click(
      screen.getByRole('link', { name: 'UnitedMasters Promote Tab' })
    );

    expect(screen.getByTestId('task-description-helper')).toBeInTheDocument();
    expect(screen.getByLabelText('Task description')).toHaveValue('');
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

  it('adds a destructive delete action to the task context menu', () => {
    renderPage();

    const tableProps = mockUnifiedTable.mock.calls.at(-1)?.[0] as
      | {
          getContextMenuItems?: (task: typeof mockTaskTwo) => ReadonlyArray<{
            readonly id: string;
            readonly label?: string;
            readonly destructive?: boolean;
          }>;
        }
      | undefined;

    const deleteItem = tableProps
      ?.getContextMenuItems?.(mockTaskTwo)
      ?.find(item => item.id === 'delete-task');

    expect(deleteItem).toMatchObject({
      id: 'delete-task',
      label: 'Delete Task',
      destructive: true,
    });
  });

  it('opens a confirmation dialog before deleting a task from the context menu', () => {
    renderPage();

    const tableProps = mockUnifiedTable.mock.calls.at(-1)?.[0] as
      | {
          getContextMenuItems?: (task: typeof mockTaskTwo) => ReadonlyArray<{
            readonly id: string;
            readonly onClick?: () => void;
          }>;
        }
      | undefined;

    const deleteItem = tableProps
      ?.getContextMenuItems?.(mockTaskTwo)
      ?.find(item => item.id === 'delete-task');

    act(() => {
      deleteItem?.onClick?.();
    });

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete task?');
    expect(dialog).toHaveTextContent(mockTaskTwo.title);

    const deleteButton = screen.getByRole('button', { name: /^Delete$/ });
    act(() => {
      fireEvent.click(deleteButton);
    });

    expect(mockDeleteTask).toHaveBeenCalledWith(mockTaskTwo.id);
  });

  it('does not delete a task when the confirmation dialog is cancelled', () => {
    renderPage();

    const tableProps = mockUnifiedTable.mock.calls.at(-1)?.[0] as
      | {
          getContextMenuItems?: (task: typeof mockTaskTwo) => ReadonlyArray<{
            readonly id: string;
            readonly onClick?: () => void;
          }>;
        }
      | undefined;

    const deleteItem = tableProps
      ?.getContextMenuItems?.(mockTaskTwo)
      ?.find(item => item.id === 'delete-task');

    act(() => {
      deleteItem?.onClick?.();
    });

    const cancelButton = screen.getByRole('button', { name: /^Cancel$/ });
    act(() => {
      fireEvent.click(cancelButton);
    });

    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it('supports j and k keyboard navigation across visible tasks', () => {
    renderPage();

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);

    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTask.title);

    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);
  });

  it('lets keyboard navigation intentionally open the first DESIGN_V1_TASKS task from empty detail', () => {
    enableDesignV1Tasks();

    renderPage();

    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j' });

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);
  });

  it('keeps task keyboard navigation out of text editors', () => {
    renderPage();

    expect(screen.getByLabelText('Task title')).toHaveValue(mockTaskTwo.title);

    fireEvent.keyDown(screen.getByLabelText('Task title'), { key: 'j' });

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

  it('filters mobile task scopes without opening a detail pane', () => {
    mockIsXlUp = false;
    mockTasksData = [mockTask, mockTaskTwo, mockJovieTask];

    renderPage();

    expect(screen.getAllByTestId('mobile-task-row')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Open 2' }));
    expect(screen.getAllByTestId('mobile-task-row')).toHaveLength(2);
    expect(screen.getByText(mockTaskTwo.title)).toBeInTheDocument();
    expect(screen.getByText(mockJovieTask.title)).toBeInTheDocument();
    expect(screen.queryByText(mockTask.title)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Closed 1' }));
    expect(screen.getAllByTestId('mobile-task-row')).toHaveLength(1);
    expect(screen.getByText(mockTask.title)).toBeInTheDocument();
  });

  it('keeps mobile assignee subviews and detail layout disjoint under DESIGN_V1_TASKS', () => {
    enableDesignV1Tasks();
    mockIsXlUp = false;
    mockTasksData = [mockTask, mockTaskTwo, mockJovieTask];

    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));

    expect(screen.getAllByTestId('mobile-task-row')).toHaveLength(1);
    expect(screen.getByText(mockJovieTask.title)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-task-row'));

    expect(screen.getByLabelText('Task title')).toHaveValue(
      mockJovieTask.title
    );
    expect(screen.getByTestId('task-list-pane')).toHaveClass('hidden');
    expect(screen.getByTestId('task-document-pane')).toHaveClass('flex');

    fireEvent.click(screen.getByRole('button', { name: 'Back to task list' }));

    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-task-list')).toBeInTheDocument();
  });
});
