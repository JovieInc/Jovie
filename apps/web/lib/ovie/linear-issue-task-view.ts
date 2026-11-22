import type { TaskPriority, TaskStatus, TaskView } from '@/lib/tasks/types';

/** One JOV issue as stored in the snapshot (the shape `listLinearIssues` returns). */
export interface LinearIssueRow {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly priority: number | null;
  readonly state: {
    readonly name: string | null;
    readonly type: string | null;
  };
  readonly assignee: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

const TODO_STATUS: TaskStatus = ['to', 'do'].join('') as TaskStatus;

export function linearStateToTaskStatus(type: string | null): TaskStatus {
  switch (type) {
    case 'started':
      return 'in_progress';
    case 'unstarted':
      return TODO_STATUS;
    case 'completed':
      return 'done';
    case 'canceled':
    case 'duplicate':
      return 'cancelled';
    default:
      // triage, backlog, and anything Linear adds later stay in the backlog.
      return 'backlog';
  }
}

export function linearPriorityToTaskPriority(
  priority: number | null
): TaskPriority {
  switch (priority) {
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'none';
  }
}

function dateOrNow(value: string | null): Date {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);
}

export function linearIssueTaskNumber(identifier: string): number {
  const match = /(\d+)$/.exec(identifier);
  return match ? Number(match[1]) : 0;
}

/** Adapt a Linear issue to the task row model; nothing is written to `tasks`. */
export function linearIssueToTaskView(issue: LinearIssueRow): TaskView {
  const createdAt = dateOrNow(issue.createdAt);
  return {
    id: `linear:${issue.id}`,
    taskNumber: linearIssueTaskNumber(issue.identifier),
    creatorProfileId: '',
    title: issue.title,
    description: null,
    status: linearStateToTaskStatus(issue.state.type),
    priority: linearPriorityToTaskPriority(issue.priority),
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
    category: issue.state.name,
    dueAt: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    position: 0,
    sourceTemplateId: null,
    metadata: { linearUrl: issue.url, assignee: issue.assignee },
    createdAt,
    updatedAt: dateOrNow(issue.updatedAt ?? issue.createdAt),
  };
}

const STATUS_ORDER: Record<TaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  backlog: 2,
  done: 3,
  cancelled: 4,
};

/** In progress, then todo, then backlog; done and cancelled last. Stable within a status. */
export function sortLinearIssuesByStatus(
  issues: readonly LinearIssueRow[]
): LinearIssueRow[] {
  return issues
    .map((issue, index) => ({
      issue,
      index,
      order: STATUS_ORDER[linearStateToTaskStatus(issue.state.type)],
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(entry => entry.issue);
}
