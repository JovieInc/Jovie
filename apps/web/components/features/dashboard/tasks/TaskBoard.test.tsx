import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TaskBoardResult, TaskStatus } from '@/lib/tasks/types';
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

  it.each([
    0, 1, 3, 4,
  ])('uses the same responsive grid contract for %s visible columns', columnCount => {
    const expectedColumnCount = Math.max(columnCount, 1);

    expect(getTaskBoardGridTemplate(columnCount)).toBe(
      `repeat(${expectedColumnCount}, minmax(0, 1fr))`
    );
  });
});
