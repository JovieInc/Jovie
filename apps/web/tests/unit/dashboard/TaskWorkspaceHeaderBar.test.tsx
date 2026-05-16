import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, FormEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskWorkspaceHeaderBar } from '@/components/features/dashboard/tasks/TaskWorkspaceHeaderBar';

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: ComponentProps<'button'> & { readonly children: ReactNode }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, ...props }: ComponentProps<'input'>) => (
    <input value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock('@/components/molecules/filters', () => ({
  TableFilterDropdown: () => <button type='button'>Filters</button>,
}));

vi.mock('@/components/organisms/table', () => ({
  PageToolbarActionButton: ({
    ariaLabel,
    label,
    onClick,
  }: {
    readonly ariaLabel?: string;
    readonly label: ReactNode;
    readonly onClick?: () => void;
  }) => (
    <button type='button' aria-label={ariaLabel} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/components/organisms/table/molecules/DisplayMenuDropdown', () => ({
  DisplayMenuDropdown: ({
    trigger,
    onViewModeChange,
  }: {
    readonly trigger: ReactNode;
    readonly onViewModeChange?: (viewMode: 'board' | 'list') => void;
  }) => (
    <div>
      {trigger}
      <button type='button' onClick={() => onViewModeChange?.('list')}>
        List view
      </button>
    </div>
  ),
}));

function createBaseProps() {
  return {
    draftTitle: '',
    taskCount: 2,
    subviews: [
      { id: 'all', label: 'All', count: 2 },
      { id: 'mine', label: 'Assigned To Me', count: 1 },
      { id: 'jovie', label: 'Assigned To Jovie', count: 1 },
    ],
    activeSubview: 'all',
    onSubviewChange: vi.fn(),
    onDraftTitleChange: vi.fn(),
    onCancelCreate: vi.fn(),
    onSubmitCreate: vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault()
    ),
    createPending: false,
    filterCategories: [],
    onClearFilters: vi.fn(),
    viewMode: 'board',
    onViewModeChange: vi.fn(),
    showCancelledColumn: false,
    onShowCancelledColumnChange: vi.fn(),
    showTaskNavigation: false,
    canSelectPrevious: false,
    canSelectNext: false,
    onSelectPrevious: vi.fn(),
    onSelectNext: vi.fn(),
  } as const;
}

describe('TaskWorkspaceHeaderBar', () => {
  it('renders a flat default shell with task actions', () => {
    render(<TaskWorkspaceHeaderBar {...createBaseProps()} mode='default' />);

    const subheader = screen.getByTestId('tasks-workspace-subheader');
    expect(subheader).not.toHaveClass('border-b');
    expect(
      screen.getByRole('tablist', { name: 'Task subviews' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All 2' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByRole('tab', { name: 'Assigned To Me 1' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search tasks' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Display options' })
    ).toBeInTheDocument();
  });

  it('emits subview changes from the compact tab strip', () => {
    const props = createBaseProps();

    render(<TaskWorkspaceHeaderBar {...props} mode='default' />);

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));

    expect(props.onSubviewChange).toHaveBeenCalledWith('jovie');
  });

  it('emits display mode changes from the display menu trigger', () => {
    const props = createBaseProps();

    render(<TaskWorkspaceHeaderBar {...props} mode='default' />);

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(props.onViewModeChange).toHaveBeenCalledWith('list');
  });

  it('renders create mode controls and submits the draft form', () => {
    const props = createBaseProps();

    render(
      <TaskWorkspaceHeaderBar
        {...props}
        mode='create'
        draftTitle='Draft release plan'
      />
    );

    expect(screen.getByLabelText('New task name')).toHaveValue(
      'Draft release plan'
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('New task name').closest('form')!);
    expect(props.onSubmitCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancelCreate).toHaveBeenCalledTimes(1);
  });
});
