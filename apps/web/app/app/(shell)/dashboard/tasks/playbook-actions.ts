'use server';

import { and, asc, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema/tasks';
import {
  requireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess,
} from '@/lib/entitlements/tasks-gate';
import type { LaunchDecisionKind } from '@/lib/launch';
import {
  buildPlaybookProjectRow,
  buildPlaybookStepRows,
  countPlaybookSteps,
} from '@/lib/tasks/playbooks/instantiate';
import {
  isPlaybookRunOutcome,
  type PlaybookRunOutcome,
  planNextRun,
} from '@/lib/tasks/playbooks/iteration';
import {
  getPlaybookTemplate,
  isPlaybookId,
} from '@/lib/tasks/playbooks/registry';
import { featureKitStepIdsForDecision } from '@/lib/tasks/playbooks/startup-feature-kit';
import {
  PLAYBOOK_AUTONOMY_LEVELS,
  type PlaybookAutonomy,
  type PlaybookId,
} from '@/lib/tasks/playbooks/types';
import { parseTaskDate } from '@/lib/tasks/task-due-date';
import {
  getNextTaskPosition,
  reserveTaskNumbers,
} from '@/lib/tasks/task-reservation';
import { requireProfileId } from '../requireProfileId';

const MAX_PROJECT_NAME_LENGTH = 200;
const MAX_INTAKE_ANSWERS = 10;
const MAX_INTAKE_ANSWER_LENGTH = 2000;
const MAX_HISTORY_RUNS = 20;

export interface StartPlaybookInput {
  readonly playbookId: PlaybookId;
  readonly projectName: string;
  /** ISO date (YYYY-MM-DD) the step offsets count from. */
  readonly targetDate: string;
  /** Defaults to the template's default (review). */
  readonly autonomy?: PlaybookAutonomy;
  /** Answers to the template's intake prompts, in prompt order. */
  readonly intakeAnswers?: readonly string[];
  /** Feature launches only: the lib/launch decision that sizes the kit. */
  readonly launchDecision?: LaunchDecisionKind;
}

function isAutonomy(value: unknown): value is PlaybookAutonomy {
  return (
    typeof value === 'string' &&
    (PLAYBOOK_AUTONOMY_LEVELS as readonly string[]).includes(value)
  );
}

function sanitizeIntakeAnswers(
  answers: readonly string[] | undefined
): string[] {
  if (!answers) return [];
  if (
    answers.length > MAX_INTAKE_ANSWERS ||
    answers.some(
      answer =>
        typeof answer !== 'string' || answer.length > MAX_INTAKE_ANSWER_LENGTH
    )
  ) {
    throw new Error('Intake answers are too long');
  }
  return answers.map(answer => answer.trim());
}

const playbookIdOf = drizzleSql`${tasks.metadata} -> 'playbook' ->> 'id'`;
const playbookRoleOf = drizzleSql`${tasks.metadata} -> 'playbook' ->> 'role'`;

/** Outcomes of this profile's earlier runs of the playbook, oldest first. */
async function loadRunHistory(
  profileId: string,
  playbookId: PlaybookId
): Promise<PlaybookRunOutcome[]> {
  const rows = await db
    .select({ metadata: tasks.metadata })
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        drizzleSql`${playbookIdOf} = ${playbookId}`,
        drizzleSql`${playbookRoleOf} = 'project'`
      )
    )
    .orderBy(asc(tasks.createdAt))
    .limit(MAX_HISTORY_RUNS);

  return rows.flatMap(row => {
    const playbook = row.metadata?.playbook as
      | Record<string, unknown>
      | undefined;
    const outcome = playbook?.outcome;
    return isPlaybookRunOutcome(outcome) ? [outcome] : [];
  });
}

export interface StartPlaybookResult {
  readonly projectTaskId: string;
  readonly stepCount: number;
}

/**
 * Starts a playbook from the Tasks picker: one parent task named after the
 * project, plus one child task per step, written in a single INSERT so a
 * partial playbook can never land.
 */
export async function startPlaybook(
  input: StartPlaybookInput
): Promise<StartPlaybookResult> {
  await requireTasksWorkspaceAccess();
  await requireReleasePlanGenerationAccess();
  const profileId = await requireProfileId();

  if (!isPlaybookId(input.playbookId)) {
    throw new Error('Unknown playbook');
  }
  const projectName = input.projectName.trim();
  if (!projectName || projectName.length > MAX_PROJECT_NAME_LENGTH) {
    throw new Error('Project name is required');
  }
  const targetDate = parseTaskDate(input.targetDate);
  if (!targetDate) {
    throw new Error('Target date is required');
  }

  const template = getPlaybookTemplate(input.playbookId);
  if (template.anchor !== 'date') {
    // Release-anchored plans start from the release so agent steps have one.
    throw new Error('This playbook starts from a release');
  }
  if (input.autonomy !== undefined && !isAutonomy(input.autonomy)) {
    throw new Error('Unknown autonomy level');
  }
  const autonomy = input.autonomy ?? template.defaultAutonomy;
  const intakeAnswers = sanitizeIntakeAnswers(input.intakeAnswers);

  let stepIds: readonly string[] | undefined;
  if (input.launchDecision !== undefined) {
    if (template.id !== 'startup-feature-kit') {
      throw new Error('Only feature launches take a launch decision');
    }
    stepIds = featureKitStepIdsForDecision(input.launchDecision);
    if (stepIds.length === 0) {
      throw new Error('This change needs no launch');
    }
  }

  const history = await loadRunHistory(profileId, template.id);
  const plan = planNextRun(template, history);
  const stepCount = countPlaybookSteps(template, stepIds);
  const [firstTaskNumber, startPosition] = await Promise.all([
    reserveTaskNumbers(profileId, stepCount + 1),
    getNextTaskPosition(profileId),
  ]);

  const projectTaskId = crypto.randomUUID();
  const projectRow = {
    id: projectTaskId,
    ...buildPlaybookProjectRow({
      template,
      creatorProfileId: profileId,
      projectName,
      targetDate,
      taskNumber: firstTaskNumber,
      position: startPosition,
      autonomy,
      plan,
      intakeAnswers,
      launchDecision: input.launchDecision ?? null,
    }),
  };
  const stepRows = buildPlaybookStepRows({
    template,
    creatorProfileId: profileId,
    targetDate,
    firstTaskNumber: firstTaskNumber + 1,
    startPosition: startPosition + 1,
    parentTaskId: projectTaskId,
    autonomy,
    plan,
    stepIds,
  });

  await db.insert(tasks).values([projectRow, ...stepRows]);

  revalidatePath(APP_ROUTES.TASKS);

  return { projectTaskId, stepCount: stepRows.length };
}

const MAX_OUTCOME_VALUE = 1_000_000_000;

function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_OUTCOME_VALUE
  );
}

/**
 * Records what a playbook run reached on its project task. The next run of
 * the same playbook reads it (planNextRun) to aim at a bigger audience.
 */
export async function recordPlaybookOutcome(
  projectTaskId: string,
  outcome: Omit<PlaybookRunOutcome, 'recordedAt'>
): Promise<void> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();

  const channelValues = Object.values(outcome.byChannel ?? {});
  const valid =
    isCount(outcome.reach) &&
    isCount(outcome.engagement) &&
    isCount(outcome.newFollowers) &&
    channelValues.every(
      channel => isCount(channel?.reach) && isCount(channel?.engagement)
    ) &&
    Array.isArray(outcome.whatWorked) &&
    outcome.whatWorked.length <= MAX_INTAKE_ANSWERS &&
    outcome.whatWorked.every(
      note =>
        typeof note === 'string' && note.length <= MAX_INTAKE_ANSWER_LENGTH
    );
  if (!valid) {
    throw new Error('Invalid playbook outcome');
  }

  const stored: PlaybookRunOutcome = {
    reach: outcome.reach,
    engagement: outcome.engagement,
    newFollowers: outcome.newFollowers,
    byChannel: outcome.byChannel,
    whatWorked: outcome.whatWorked,
    recordedAt: new Date().toISOString(),
  };

  const updated = await db
    .update(tasks)
    .set({
      metadata: drizzleSql`jsonb_set(${tasks.metadata}, '{playbook,outcome}', ${JSON.stringify(stored)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, projectTaskId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        drizzleSql`${playbookRoleOf} = 'project'`
      )
    )
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    throw new Error('Playbook run not found');
  }

  revalidatePath(APP_ROUTES.TASKS);
}
