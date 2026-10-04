import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TaskWorkspaceHeaderBar,
  type TaskWorkspaceHeaderBarProps,
} from './TaskWorkspaceHeaderBar';

function renderHeader(overrides: Partial<TaskWorkspaceHeaderBarProps> = {}) {
  const props: TaskWorkspaceHeaderBarProps = {
    mode: 'default',
    draftTitle: '',
    taskCount: 0,
    subviews: [],
    activeSubview: 'all',
    onSubviewChange: vi.fn(),
    onDraftTitleChange: vi.fn(),
    onCancelCreate: vi.fn(),
    onSubmitCreate: vi.fn(),
    createPending: false,
    filterCategories: [],
    onClearFilters: vi.fn(),
    onCreateTask: vi.fn(),
    viewMode: 'list',
    onViewModeChange: vi.fn(),
    showCancelledColumn: false,
    onShowCancelledColumnChange: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <TaskWorkspaceHeaderBar {...props} />
    </TooltipProvider>
  );
  return props;
}

describe('TaskWorkspaceHeaderBar', () => {
  it('uses the single unified header-height token (founder lock 2026-09-25)', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).toContain(
      'h-(--app-shell-header-height) min-h-(--app-shell-header-height)'
    );
    expect(source).not.toContain('--app-shell-header-height-compact');
  });

  it('keeps the primary New Task action visible at every breakpoint', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).toContain("{mode === 'create' ? 'Create' : 'New Task'}");
    expect(source).not.toContain("'hidden lg:inline-flex'");
  });

  it('opens the playbook picker from the toolbar when wired', () => {
    const onStartPlaybook = vi.fn();
    renderHeader({ onStartPlaybook });

    fireEvent.click(
      screen.getByRole('button', { name: 'Start From a Playbook' })
    );
    expect(onStartPlaybook).toHaveBeenCalledTimes(1);
  });

  it('hides the playbook action when no handler is wired', () => {
    renderHeader();

    expect(
      screen.queryByRole('button', { name: 'Start From a Playbook' })
    ).not.toBeInTheDocument();
  });
});
