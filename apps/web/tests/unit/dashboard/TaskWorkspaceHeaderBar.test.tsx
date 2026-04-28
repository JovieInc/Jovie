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

vi.mock('@/components/molecules/AppSearchField', () => ({
  AppSearchField: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly ariaLabel: string;
    readonly placeholder?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
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

function createBaseProps() {
  return {
    search: '',
    draftTitle: '',
    taskCount: 2,
    subviews: [
      { id: 'all', label: 'All', count: 2 },
      { id: 'mine', label: 'Assigned To Me', count: 1 },
      { id: 'jovie', label: 'Assigned To Jovie', count: 1 },
    ],
    activeSubview: 'all',
    onSubviewChange: vi.fn(),
    onSearchChange: vi.fn(),
    onDraftTitleChange: vi.fn(),
    onEnterSearch: vi.fn(),
    onExitSearch: vi.fn(),
    onCancelCreate: vi.fn(),
    onSubmitCreate: vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault()
    ),
    createPending: false,
    filterCategories: [],
    onClearFilters: vi.fn(),
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
      screen.getByRole('button', { name: 'Search tasks' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('emits subview changes from the compact tab strip', () => {
    const props = createBaseProps();

    render(<TaskWorkspaceHeaderBar {...props} mode='default' />);

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned To Jovie 1' }));

    expect(props.onSubviewChange).toHaveBeenCalledWith('jovie');
  });

  it('renders search mode controls without reintroducing the divider', () => {
    const props = createBaseProps();

    render(<TaskWorkspaceHeaderBar {...props} mode='search' />);

    const subheader = screen.getByTestId('tasks-workspace-subheader');
    expect(subheader).not.toHaveClass('border-b');
    expect(screen.getByRole('textbox', { name: 'Search tasks' })).toHaveValue(
      ''
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(props.onExitSearch).toHaveBeenCalledTimes(1);
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
