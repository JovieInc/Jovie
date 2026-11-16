import { TooltipProvider } from '@jovie/ui';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskWorkspaceHeaderBar } from './TaskWorkspaceHeaderBar';

type HeaderBarProps = ComponentProps<typeof TaskWorkspaceHeaderBar>;

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}

function baseProps(overrides: Partial<HeaderBarProps> = {}): HeaderBarProps {
  return {
    mode: 'default',
    draftTitle: '',
    taskCount: 12,
    subviews: [
      { id: 'all', label: 'All', count: 12 },
      { id: 'mine', label: 'Mine', count: 5 },
    ],
    activeSubview: 'all',
    onSubviewChange: vi.fn(),
    onDraftTitleChange: vi.fn(),
    onCancelCreate: vi.fn(),
    onSubmitCreate: vi.fn(event => event.preventDefault()),
    createPending: false,
    filterCategories: [],
    onClearFilters: vi.fn(),
    onCreateTask: vi.fn(),
    viewMode: 'board',
    onViewModeChange: vi.fn(),
    showCancelledColumn: false,
    onShowCancelledColumnChange: vi.fn(),
    ...overrides,
  };
}

function CreateHarness(props: HeaderBarProps) {
  const [draftTitle, setDraftTitle] = useState('');
  return (
    <TaskWorkspaceHeaderBar
      {...props}
      draftTitle={draftTitle}
      onDraftTitleChange={value => {
        setDraftTitle(value);
        props.onDraftTitleChange(value);
      }}
    />
  );
}

describe('TaskWorkspaceHeaderBar certificate', () => {
  it('starts a new task from the default toolbar and stays axe-clean', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const { container } = render(<TaskWorkspaceHeaderBar {...props} />);

    await user.click(screen.getByRole('button', { name: /New Task/ }));
    expect(props.onCreateTask).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('focuses the draft field only when create mode starts', () => {
    const props = baseProps();
    const { rerender } = render(<TaskWorkspaceHeaderBar {...props} />);
    expect(document.activeElement).toBe(document.body);

    rerender(<TaskWorkspaceHeaderBar {...props} mode='create' />);
    expect(
      screen.getByRole('textbox', { name: 'New Task Name' })
    ).toHaveFocus();
  });

  it('keeps typed text and focus through a rerender and Escape, then submits', async () => {
    const user = userEvent.setup();
    const props = baseProps({ mode: 'create' });
    const { container, rerender } = render(<CreateHarness {...props} />);
    const input = screen.getByRole('textbox', { name: 'New Task Name' });

    await user.type(input, 'Pitch sync supervisor');
    expect(input).toHaveValue('Pitch sync supervisor');
    expect(props.onDraftTitleChange).toHaveBeenLastCalledWith(
      'Pitch sync supervisor'
    );

    rerender(<CreateHarness {...props} taskCount={13} />);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('textbox', { name: 'New Task Name' })).toHaveValue(
      'Pitch sync supervisor'
    );
    expect(
      screen.getByRole('textbox', { name: 'New Task Name' })
    ).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(props.onSubmitCreate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('cancels create mode and keeps Create disabled while empty or pending', async () => {
    const user = userEvent.setup();
    const props = baseProps({ mode: 'create' });
    const { rerender } = render(<TaskWorkspaceHeaderBar {...props} />);

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancelCreate).toHaveBeenCalledTimes(1);

    rerender(
      <TaskWorkspaceHeaderBar
        {...props}
        draftTitle='Update bio'
        createPending
      />
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('shows the task count alone when there are no subviews', async () => {
    const { container } = render(
      <TaskWorkspaceHeaderBar {...baseProps({ subviews: [], taskCount: 1 })} />
    );

    expect(screen.getByText('1 Task')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves to the next task and disables the unavailable direction', async () => {
    const user = userEvent.setup();
    const props = baseProps({
      showTaskNavigation: true,
      canSelectNext: true,
      onSelectNext: vi.fn(),
      onSelectPrevious: vi.fn(),
    });
    const { container } = render(<TaskWorkspaceHeaderBar {...props} />);

    expect(
      screen.getByRole('button', { name: 'Previous Task' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next Task' }));
    expect(props.onSelectNext).toHaveBeenCalledTimes(1);
    expect(props.onSelectPrevious).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
