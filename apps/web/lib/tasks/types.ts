export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'cancelled';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export type TaskAssigneeKind = 'human' | 'jovie';

export type TaskAgentStatus =
  | 'idle'
  | 'queued'
  | 'drafting'
  | 'awaiting_review'
  | 'approved'
  | 'failed';

export interface TaskCursor {
  readonly position: number;
  readonly id: string;
}

export interface TaskFilters {
  readonly search?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly assigneeKind?: TaskAssigneeKind;
  readonly releaseId?: string | null;
  readonly limit?: number;
  readonly cursor?: TaskCursor | null;
}

export interface TaskView {
  readonly id: string;
  readonly taskNumber: number;
  readonly creatorProfileId: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeKind: TaskAssigneeKind;
  readonly assigneeUserId: string | null;
  readonly agentType: string | null;
  readonly agentStatus: TaskAgentStatus;
  readonly agentInput: Record<string, unknown> | null;
  readonly agentOutput: Record<string, unknown> | null;
  readonly agentError: string | null;
  readonly releaseId: string | null;
  readonly releaseTitle: string | null;
  readonly parentTaskId: string | null;
  readonly category: string | null;
  readonly dueAt: Date | null;
  readonly scheduledFor: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly position: number;
  readonly sourceTemplateId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskListResult {
  readonly tasks: TaskView[];
  readonly nextCursor: TaskCursor | null;
}

export interface TaskStats {
  readonly backlog: number;
  readonly todo: number;
  readonly inProgress: number;
  readonly done: number;
  readonly cancelled: number;
  readonly activeTodoCount: number;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly assigneeKind?: TaskAssigneeKind;
  readonly assigneeUserId?: string | null;
  readonly agentType?: string | null;
  readonly agentStatus?: TaskAgentStatus;
  readonly agentInput?: Record<string, unknown> | null;
  readonly agentOutput?: Record<string, unknown> | null;
  readonly agentError?: string | null;
  readonly releaseId?: string | null;
  readonly parentTaskId?: string | null;
  readonly category?: string | null;
  readonly dueAt?: Date | null;
  readonly scheduledFor?: Date | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly sourceTemplateId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly assigneeKind?: TaskAssigneeKind;
  readonly assigneeUserId?: string | null;
  readonly agentType?: string | null;
  readonly agentStatus?: TaskAgentStatus;
  readonly agentInput?: Record<string, unknown> | null;
  readonly agentOutput?: Record<string, unknown> | null;
  readonly agentError?: string | null;
  readonly releaseId?: string | null;
  readonly parentTaskId?: string | null;
  readonly category?: string | null;
  readonly dueAt?: Date | null;
  readonly scheduledFor?: Date | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly position?: number;
  readonly sourceTemplateId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}
