import type {
  MoveTaskResult,
  TaskBoardResult,
  TaskListResult,
  TaskStats,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';

export function createTask(overrides: Partial<TaskView> = {}): TaskView {
  const now = new Date('2026-03-30T12:00:00.000Z');

  return {
    id: 'task-1',
    taskNumber: 12,
    creatorProfileId: 'profile-1',
    title: 'Update artist bio',
    description: null,
    status: 'todo',
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
    position: 0,
    sourceTemplateId: null,
    metadata: null,
    mutationVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createTaskList(...tasks: TaskView[]): TaskListResult {
  return {
    tasks,
    nextCursor: null,
  };
}

export function createTaskBoard(...rows: TaskView[]): TaskBoardResult {
  const statuses: TaskStatus[] = [
    'backlog',
    'todo',
    'in_progress',
    'done',
    'cancelled',
  ];

  return {
    columns: statuses.map(status => {
      const tasks = rows.filter(task => task.status === status);
      return {
        status,
        tasks,
        totalCount: tasks.length,
        nextCursor: null,
      };
    }),
    totalCount: rows.length,
  };
}

export function createTaskStats(overrides: Partial<TaskStats> = {}): TaskStats {
  return {
    backlog: 0,
    todo: 1,
    inProgress: 0,
    done: 0,
    cancelled: 0,
    activeTodoCount: 1,
    newActiveTodoCount: 0,
    ...overrides,
  };
}

export function createMoveResult(...tasks: TaskView[]): MoveTaskResult {
  return {
    success: true,
    affectedTasks: tasks.map(task => ({
      ...task,
      mutationVersion: task.mutationVersion ?? 1,
    })),
  };
}
