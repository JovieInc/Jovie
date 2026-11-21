import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskBoardResult, TaskStatus, TaskView } from '@/lib/tasks/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { getTaskBoardGridTemplate, TaskBoard } from './TaskBoard';

const visibleStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress'];
const emptyBoard: TaskBoardResult = {
  columns: [],
  totalCount: 0,
};

const boardProps = {
  board: emptyBoard,
  visibleStatuses,
  artistName: 'Tim White',
  selectedTaskId: null,
  onOpenTask: vi.fn(),
  onCreateTask: vi.fn(),
  onMoveTask: vi.fn(),
  getTaskContextMenuItems: vi.fn(() => []),
};

describe('TaskBoard geometry', () => {
  it('keeps loading and loaded states on the same column grid', () => {
    const { getByTestId, rerender } = render(
      <TaskBoard {...boardProps} isLoading />
    );
    const loadingBoard = getByTestId('tasks-board-skeleton');
    const loadingTemplate = loadingBoard.style.gridTemplateColumns;

    expect(loadingBoard.children).toHaveLength(visibleStatuses.length);

    rerender(<TaskBoard {...boardProps} isLoading={false} />);

    expect(getByTestId('tasks-board').style.gridTemplateColumns).toBe(
      loadingTemplate
    );
  });

  it.each([0, 1, 3, 4])(
    'uses the same responsive grid contract for %s visible columns',
    columnCount => {
      const expectedColumnCount = Math.max(columnCount, 1);

      expect(getTaskBoardGridTemplate(columnCount)).toBe(
        `repeat(${expectedColumnCount}, minmax(0, 1fr))`
      );
    }
  );

  it('keeps board create actions at 32px on desktop with mobile hit room', () => {
    const source = readFileSync(resolve(__dirname, './TaskBoard.tsx'), 'utf8');

    expect(source).toContain('relative inline-flex h-8 w-8 shrink-0');
    expect(source).toContain('before:h-11 before:w-11');
    expect(source).toContain('sm:before:h-8 sm:before:w-8');
    expect(source).not.toContain('inline-flex h-7 w-7 shrink-0');
  });
});

describe('banned icon guard (Tim, 2026-09-25)', () => {
  it('drops the retired Disc3 release-title glyph', () => {
    const source = readFileSync(resolve(__dirname, './TaskBoard.tsx'), 'utf8');
    expect(source).not.toContain('Disc3');
    expect(source).toContain('<Layers className=');
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './TaskBoard.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});

const task: TaskView = {
  id: 'task-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title: 'Upload final master',
  description: null,
  status: 'todo',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'idle',
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: 'release-1',
  releaseTitle: 'QA Release',
  parentTaskId: null,
  category: 'distribution',
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('TaskBoard interactions', () => {
  it('opens a task card and creates a task from a column', async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onCreateTask = vi.fn();
    const board: TaskBoardResult = {
      totalCount: 1,
      columns: [
        { status: 'todo', tasks: [task], totalCount: 1, nextCursor: null },
      ],
    };
    const { container } = render(
      <TaskBoard
        {...boardProps}
        board={board}
        isLoading={false}
        onOpenTask={onOpenTask}
        onCreateTask={onCreateTask}
      />
    );

    await user.click(screen.getByTestId('task-board-card-task-1'));
    expect(onOpenTask).toHaveBeenCalledWith(task);

    await user.click(
      screen.getAllByRole('button', { name: /Create .* task/ })[0]
    );
    expect(onCreateTask).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders the empty and loading boards axe-clean', async () => {
    const empty = render(<TaskBoard {...boardProps} isLoading={false} />);
    expect(screen.getByTestId('tasks-board')).toBeInTheDocument();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const loading = render(<TaskBoard {...boardProps} isLoading />);
    expect(screen.getByTestId('tasks-board-skeleton')).toBeInTheDocument();
    await expectNoA11yViolations(loading.container);
  });
});
