import type { TaskStatus, TaskView, UpdateTaskInput } from './types';

export interface TaskUpdateFieldPatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: TaskStatus;
  readonly priority?: TaskView['priority'];
  readonly assigneeKind?: TaskView['assigneeKind'];
  readonly assigneeUserId?: string | null;
  readonly agentType?: string | null;
  readonly agentStatus?: TaskView['agentStatus'];
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
  readonly updatedAt: Date;
}

type MutableTaskUpdateFieldPatch = {
  -readonly [Key in keyof TaskUpdateFieldPatch]: TaskUpdateFieldPatch[Key];
};

function resolvePatchCompletedAt(
  data: UpdateTaskInput,
  existingTask: Pick<TaskView, 'completedAt' | 'status'>,
  now: Date
): Date | null | undefined {
  if (data.completedAt !== undefined) return data.completedAt;
  if (data.status === undefined) return undefined;
  return data.status === 'done' ? (existingTask.completedAt ?? now) : null;
}

export function buildTaskUpdateFieldPatch(
  data: UpdateTaskInput,
  existingTask: Pick<TaskView, 'completedAt' | 'status'>,
  now = new Date()
): TaskUpdateFieldPatch {
  const patch: Partial<MutableTaskUpdateFieldPatch> = {
    updatedAt: now,
  };

  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.status !== undefined) patch.status = data.status;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.assigneeKind !== undefined) patch.assigneeKind = data.assigneeKind;
  if (data.assigneeUserId !== undefined) {
    patch.assigneeUserId = data.assigneeUserId;
  }
  if (data.agentType !== undefined) patch.agentType = data.agentType;
  if (data.agentStatus !== undefined) patch.agentStatus = data.agentStatus;
  if (data.agentInput !== undefined) patch.agentInput = data.agentInput;
  if (data.agentOutput !== undefined) patch.agentOutput = data.agentOutput;
  if (data.agentError !== undefined) patch.agentError = data.agentError;
  if (data.releaseId !== undefined) patch.releaseId = data.releaseId;
  if (data.parentTaskId !== undefined) patch.parentTaskId = data.parentTaskId;
  if (data.category !== undefined) patch.category = data.category;
  if (data.dueAt !== undefined) patch.dueAt = data.dueAt;
  if (data.scheduledFor !== undefined) patch.scheduledFor = data.scheduledFor;
  if (data.startedAt !== undefined) patch.startedAt = data.startedAt;

  const completedAt = resolvePatchCompletedAt(data, existingTask, now);
  if (completedAt !== undefined) patch.completedAt = completedAt;

  if (data.position !== undefined) patch.position = data.position;
  if (data.sourceTemplateId !== undefined) {
    patch.sourceTemplateId = data.sourceTemplateId;
  }
  if (data.metadata !== undefined) patch.metadata = data.metadata;

  return patch as TaskUpdateFieldPatch;
}
