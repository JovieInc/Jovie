import { describe, expect, it } from 'vitest';
import {
  applyTaskBoardMove,
  applyTaskListMove,
  compareTasksByBoardOrder,
  getVisibleTaskBoardStatuses,
  resolveTaskBoardMoveInput,
} from './task-board';
import type {
  TaskBoardColumnResult,
  TaskBoardResult,
  TaskStatus,
  TaskView,
} from './types';

function createTask(
  id: string,
  status: TaskStatus,
  position: number
): TaskView {
  const createdAt = new Date(`2026-05-14T00:00:0${position}.000Z`);

  return {
    id,
    taskNumber: position,
    creatorProfileId: 'profile-1',
    title: `Task ${id}`,
    description: null,
    status,
    priority: 'medium',
    assigneeKind: 'human',
    assigneeUserId: null,
    agentType: null,
    agentStatus: 'idle',
    agentInput: null,
    agentOutput: null,
    agentError: null,
    releaseId: null,
    releaseTitle: null,
    parentTaskId: null,
    category: null,
    dueAt: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    position,
    sourceTemplateId: null,
    metadata: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function createColumns(tasks: TaskView[]): TaskBoardColumnResult[] {
  const statuses: TaskStatus[] = [
    'backlog',
    'todo',
    'in_progress',
    'done',
    'cancelled',
  ];

  return statuses.map(status => {
    const columnTasks = tasks.filter(task => task.status === status);
    return {
      status,
      tasks: columnTasks,
      totalCount: columnTasks.length,
      nextCursor: null,
    };
  });
}

function createBoard(tasks: TaskView[]): TaskBoardResult {
  return {
    columns: createColumns(tasks),
    totalCount: tasks.length,
  };
}

function expectSingleAnchor(
  input: ReturnType<typeof resolveTaskBoardMoveInput>
): void {
  expect(input).not.toBeNull();
  if (!input) return;

  const anchorCount = [input.beforeTaskId, input.afterTaskId].filter(
    Boolean
  ).length;
  expect(anchorCount).toBeLessThanOrEqual(1);
}

describe('task board helpers', () => {
  it('sorts tasks by canonical status rank before position', () => {
    const tasks = [
      createTask('done', 'done', 1),
      createTask('backlog', 'backlog', 9),
      createTask('progress', 'in_progress', 2),
      createTask('todo', 'todo', 1),
    ];

    expect(tasks.sort(compareTasksByBoardOrder).map(task => task.id)).toEqual([
      'backlog',
      'todo',
      'progress',
      'done',
    ]);
  });

  it('uses cancelled as a hidden column unless requested or filtered', () => {
    expect(
      getVisibleTaskBoardStatuses({
        statusFilter: 'all',
        showCancelled: false,
      })
    ).toEqual(['backlog', 'todo', 'in_progress', 'done']);

    expect(
      getVisibleTaskBoardStatuses({
        statusFilter: 'all',
        showCancelled: true,
      })
    ).toEqual(['backlog', 'todo', 'in_progress', 'done', 'cancelled']);

    expect(
      getVisibleTaskBoardStatuses({
        statusFilter: 'cancelled',
        showCancelled: false,
      })
    ).toEqual(['cancelled']);
  });

  it('applies optimistic cross-column moves and count changes', () => {
    const board = createBoard([
      createTask('todo-1', 'todo', 1),
      createTask('todo-2', 'todo', 2),
      createTask('done-1', 'done', 1),
    ]);

    const moved = applyTaskBoardMove(board, {
      taskId: 'todo-2',
      toStatus: 'done',
      beforeTaskId: 'done-1',
      afterTaskId: null,
    });

    expect(
      moved?.columns
        .find(column => column.status === 'todo')
        ?.tasks.map(task => task.id)
    ).toEqual(['todo-1']);
    expect(
      moved?.columns
        .find(column => column.status === 'done')
        ?.tasks.map(task => task.id)
    ).toEqual(['todo-2', 'done-1']);
    expect(
      moved?.columns.find(column => column.status === 'todo')?.totalCount
    ).toBe(1);
    expect(
      moved?.columns.find(column => column.status === 'done')?.totalCount
    ).toBe(2);
  });

  it('resolves same-column middle moves with only a before anchor', () => {
    const columns = createColumns([
      createTask('todo-1', 'todo', 1),
      createTask('todo-2', 'todo', 2),
      createTask('todo-3', 'todo', 3),
      createTask('todo-4', 'todo', 4),
    ]);

    const input = resolveTaskBoardMoveInput({
      activeTaskId: 'todo-1',
      overId: 'todo-3',
      columns,
    });

    expectSingleAnchor(input);
    expect(input).toEqual({
      taskId: 'todo-1',
      toStatus: 'todo',
      beforeTaskId: 'todo-4',
    });
    expect(input?.afterTaskId).toBeUndefined();
  });

  it('resolves end-of-column moves with only an after anchor', () => {
    const columns = createColumns([
      createTask('todo-1', 'todo', 1),
      createTask('todo-2', 'todo', 2),
    ]);

    const input = resolveTaskBoardMoveInput({
      activeTaskId: 'todo-1',
      overId: 'task-board-column:todo',
      columns,
    });

    expectSingleAnchor(input);
    expect(input).toEqual({
      taskId: 'todo-1',
      toStatus: 'todo',
      afterTaskId: 'todo-2',
    });
  });

  it('returns null when a drag would leave the task in the same position', () => {
    const columns = createColumns([
      createTask('todo-1', 'todo', 1),
      createTask('todo-2', 'todo', 2),
    ]);

    expect(
      resolveTaskBoardMoveInput({
        activeTaskId: 'todo-1',
        overId: 'todo-1',
        columns,
      })
    ).toBeNull();

    expect(
      resolveTaskBoardMoveInput({
        activeTaskId: 'todo-2',
        overId: 'todo-2',
        columns,
      })
    ).toBeNull();
  });

  it('applies optimistic list status updates with canonical ordering', () => {
    const moved = applyTaskListMove(
      {
        tasks: [
          createTask('done-1', 'done', 1),
          createTask('todo-1', 'todo', 1),
        ],
        nextCursor: null,
      },
      {
        taskId: 'done-1',
        toStatus: 'backlog',
      }
    );

    expect(moved?.tasks.map(task => [task.id, task.status])).toEqual([
      ['done-1', 'backlog'],
      ['todo-1', 'todo'],
    ]);
  });
});
