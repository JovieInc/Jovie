import { sanitizeTaskDueAt } from './task-due-date';
import type { TaskMutationSnapshot, TaskView } from './types';

export function mapTaskRow(
  row: Omit<TaskView, 'releaseTitle'> & { releaseTitle?: string | null }
): TaskMutationSnapshot {
  return {
    id: row.id,
    taskNumber: row.taskNumber,
    creatorProfileId: row.creatorProfileId,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    assigneeKind: row.assigneeKind,
    assigneeUserId: row.assigneeUserId ?? null,
    agentType: row.agentType ?? null,
    agentStatus: row.agentStatus,
    agentInput: row.agentInput ?? null,
    agentOutput: row.agentOutput ?? null,
    agentError: row.agentError ?? null,
    releaseId: row.releaseId ?? null,
    releaseTitle: row.releaseTitle ?? null,
    parentTaskId: row.parentTaskId ?? null,
    category: row.category ?? null,
    // Drop epoch / multi-year historical dues so the list never paints "12Y ago".
    dueAt: sanitizeTaskDueAt(row.dueAt ?? null),
    scheduledFor: row.scheduledFor ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    position: row.position,
    sourceTemplateId: row.sourceTemplateId ?? null,
    metadata: row.metadata ?? null,
    mutationVersion: row.mutationVersion ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
