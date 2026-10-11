/**
 * Pure row builders that turn a playbook template into `tasks` inserts.
 * Shared by the per-release plan (music release) and the Tasks picker.
 */

import { computeTaskDueDate } from '@/lib/tasks/task-due-date';
import type { TaskAssigneeKind, TaskPriority } from '@/lib/tasks/types';
import type {
  PlaybookId,
  PlaybookStep,
  PlaybookStepOwner,
  PlaybookTemplate,
} from './types';

/** Stored under `tasks.metadata.playbook`. */
export interface PlaybookTaskMetadata {
  readonly id: PlaybookId;
  readonly version: number;
  /** `project` is the parent row the picker creates; steps hang off it. */
  readonly role: 'project' | 'step';
  readonly stepId?: string;
  readonly owner?: PlaybookStepOwner;
  readonly targetDate?: string | null;
}

export interface PlaybookTaskRow {
  readonly taskNumber: number;
  readonly creatorProfileId: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: 'todo';
  readonly priority: TaskPriority;
  readonly assigneeKind: TaskAssigneeKind;
  readonly agentType: string | null;
  readonly agentStatus: 'idle';
  readonly releaseId: string | null;
  readonly parentTaskId: string | null;
  readonly category: string | null;
  readonly dueAt: Date | null;
  readonly position: number;
  readonly sourceTemplateId: null;
  readonly metadata: Record<string, unknown>;
}

export interface BuildPlaybookStepRowsInput {
  readonly template: PlaybookTemplate;
  readonly creatorProfileId: string;
  readonly targetDate: Date | string | null;
  readonly firstTaskNumber: number;
  readonly startPosition: number;
  readonly releaseId?: string | null;
  readonly parentTaskId?: string | null;
  readonly now?: Date;
}

function stepMetadata(
  template: PlaybookTemplate,
  step: PlaybookStep
): Record<string, unknown> {
  const playbook: PlaybookTaskMetadata = {
    id: template.id,
    version: template.version,
    role: 'step',
    stepId: step.id,
    owner: step.owner,
  };

  return {
    dueDaysOffset: step.offsetDays,
    explainerText: step.explainerText ?? null,
    learnMoreUrl: step.learnMoreUrl ?? null,
    videoUrl: null,
    ...(step.descriptionHelper
      ? { descriptionHelper: step.descriptionHelper }
      : {}),
    playbook,
  };
}

export function buildPlaybookStepRows({
  template,
  creatorProfileId,
  targetDate,
  firstTaskNumber,
  startPosition,
  releaseId = null,
  parentTaskId = null,
  now,
}: BuildPlaybookStepRowsInput): PlaybookTaskRow[] {
  return template.steps.map((step, index) => ({
    taskNumber: firstTaskNumber + index,
    creatorProfileId,
    title: step.title,
    description: step.description ?? null,
    status: 'todo',
    priority: step.priority,
    assigneeKind: step.agentAssist ? 'jovie' : 'human',
    agentType: step.agentAssist?.agentType ?? null,
    agentStatus: 'idle',
    releaseId,
    parentTaskId,
    category: step.phase,
    dueAt: computeTaskDueDate(targetDate, step.offsetDays, { now }),
    position: startPosition + index,
    sourceTemplateId: null,
    metadata: stepMetadata(template, step),
  }));
}

export interface BuildPlaybookProjectRowInput {
  readonly template: PlaybookTemplate;
  readonly creatorProfileId: string;
  readonly projectName: string;
  readonly targetDate: Date | null;
  readonly taskNumber: number;
  readonly position: number;
}

/** The parent task that groups a picker-started playbook's steps. */
export function buildPlaybookProjectRow({
  template,
  creatorProfileId,
  projectName,
  targetDate,
  taskNumber,
  position,
}: BuildPlaybookProjectRowInput): PlaybookTaskRow {
  const playbook: PlaybookTaskMetadata = {
    id: template.id,
    version: template.version,
    role: 'project',
    targetDate: targetDate ? targetDate.toISOString() : null,
  };

  return {
    taskNumber,
    creatorProfileId,
    title: projectName,
    description: null,
    status: 'todo',
    priority: 'high',
    assigneeKind: 'human',
    agentType: null,
    agentStatus: 'idle',
    releaseId: null,
    parentTaskId: null,
    category: template.name,
    dueAt: targetDate,
    position,
    sourceTemplateId: null,
    metadata: { playbook },
  };
}
