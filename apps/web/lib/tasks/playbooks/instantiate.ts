/**
 * Pure row builders that turn a playbook template into `tasks` inserts.
 * Shared by the per-release plan (music release) and the Tasks picker.
 */

import type { LaunchDecisionKind } from '@/lib/launch';
import { computeTaskDueDate } from '@/lib/tasks/task-due-date';
import type { TaskAssigneeKind, TaskPriority } from '@/lib/tasks/types';
import { resolveStepAutonomy } from './autonomy';
import type { PlaybookRunPlan } from './iteration';
import type {
  PlaybookAutonomy,
  PlaybookChannel,
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
  readonly channel?: PlaybookChannel | null;
  /** Run-level choice on the project; effective level on each step. */
  readonly autonomy: PlaybookAutonomy;
  readonly targetDate?: string | null;
  readonly runNumber?: number;
  readonly audienceTarget?: number | null;
  readonly rationale?: readonly string[];
  readonly intakeAnswers?: readonly string[];
  readonly launchDecision?: LaunchDecisionKind | null;
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
  readonly autonomy: PlaybookAutonomy;
  /** Adapted priorities from the previous runs (iteration.ts). */
  readonly plan?: PlaybookRunPlan;
  /** Only these steps, e.g. the subset a launch decision calls for. */
  readonly stepIds?: readonly string[];
  readonly now?: Date;
}

function stepMetadata(
  template: PlaybookTemplate,
  step: PlaybookStep,
  autonomy: PlaybookAutonomy
): Record<string, unknown> {
  const playbook: PlaybookTaskMetadata = {
    id: template.id,
    version: template.version,
    role: 'step',
    stepId: step.id,
    owner: step.owner,
    channel: step.channel ?? null,
    autonomy,
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
  autonomy,
  plan,
  stepIds,
  now,
}: BuildPlaybookStepRowsInput): PlaybookTaskRow[] {
  const keep = stepIds ? new Set(stepIds) : null;
  const steps = keep
    ? template.steps.filter(step => keep.has(step.id))
    : template.steps;

  return steps.map((step, index) => {
    const stepAutonomy = resolveStepAutonomy(autonomy, step);
    return {
      taskNumber: firstTaskNumber + index,
      creatorProfileId,
      title: step.title,
      description: step.description ?? null,
      status: 'todo',
      priority: plan?.stepPriority[step.id] ?? step.priority,
      assigneeKind: stepAutonomy === 'hands_on' ? 'human' : 'jovie',
      agentType: step.agentAssist?.agentType ?? null,
      agentStatus: 'idle',
      releaseId,
      parentTaskId,
      category: step.phase,
      dueAt: computeTaskDueDate(targetDate, step.offsetDays, { now }),
      position: startPosition + index,
      sourceTemplateId: null,
      metadata: stepMetadata(template, step, stepAutonomy),
    };
  });
}

/** How many step rows a build will produce, for task-number reservation. */
export function countPlaybookSteps(
  template: PlaybookTemplate,
  stepIds?: readonly string[]
): number {
  if (!stepIds) return template.steps.length;
  const keep = new Set(stepIds);
  return template.steps.filter(step => keep.has(step.id)).length;
}

export interface BuildPlaybookProjectRowInput {
  readonly template: PlaybookTemplate;
  readonly creatorProfileId: string;
  readonly projectName: string;
  readonly targetDate: Date | null;
  readonly taskNumber: number;
  readonly position: number;
  readonly autonomy: PlaybookAutonomy;
  readonly plan?: PlaybookRunPlan;
  readonly intakeAnswers?: readonly string[];
  readonly launchDecision?: LaunchDecisionKind | null;
}

/** The parent task that groups a picker-started playbook's steps. */
export function buildPlaybookProjectRow({
  template,
  creatorProfileId,
  projectName,
  targetDate,
  taskNumber,
  position,
  autonomy,
  plan,
  intakeAnswers = [],
  launchDecision = null,
}: BuildPlaybookProjectRowInput): PlaybookTaskRow {
  const playbook: PlaybookTaskMetadata = {
    id: template.id,
    version: template.version,
    role: 'project',
    autonomy,
    targetDate: targetDate ? targetDate.toISOString() : null,
    runNumber: plan?.runNumber ?? 1,
    audienceTarget: plan?.audienceTarget ?? null,
    rationale: plan?.rationale ?? [],
    intakeAnswers,
    launchDecision,
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
