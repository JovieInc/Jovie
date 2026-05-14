import { describe, expect, it } from 'vitest';
import {
  applyTaskBoardMove,
  applyTaskListMove,
  compareTasksByBoardOrder,
  getVisibleTaskBoardStatuses,
} from './task-board';
import type { TaskBoardResult, TaskStatus, TaskView } from './types';

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

function createBoard(tasks: TaskView[]): TaskBoardResult {
  const statuses: TaskStatus[] = [
    'backlog',
    'todo',
    'in_progress',
    'done',
    'cancelled',
  ];

  return {
    columns: statuses.map(status => {
      const columnTasks = tasks.filter(task => task.status === status);
      return {
        status,
        tasks: columnTasks,
        totalCount: columnTasks.length,
        nextCursor: null,
      };
    }),
    totalCount: tasks.length,
  };
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
