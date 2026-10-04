'use server';

import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema/tasks';
import {
  requireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess,
} from '@/lib/entitlements/tasks-gate';
import {
  buildPlaybookProjectRow,
  buildPlaybookStepRows,
} from '@/lib/tasks/playbooks/instantiate';
import {
  getPlaybookTemplate,
  isPlaybookId,
} from '@/lib/tasks/playbooks/registry';
import type { PlaybookId } from '@/lib/tasks/playbooks/types';
import { parseTaskDate } from '@/lib/tasks/task-due-date';
import {
  getNextTaskPosition,
  reserveTaskNumbers,
} from '@/lib/tasks/task-reservation';
import { requireProfileId } from '../requireProfileId';

const MAX_PROJECT_NAME_LENGTH = 200;

export interface StartPlaybookInput {
  readonly playbookId: PlaybookId;
  readonly projectName: string;
  /** ISO date (YYYY-MM-DD) the step offsets count from. */
  readonly targetDate: string;
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
  const [firstTaskNumber, startPosition] = await Promise.all([
    reserveTaskNumbers(profileId, template.steps.length + 1),
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
    }),
  };
  const stepRows = buildPlaybookStepRows({
    template,
    creatorProfileId: profileId,
    targetDate,
    firstTaskNumber: firstTaskNumber + 1,
    startPosition: startPosition + 1,
    parentTaskId: projectTaskId,
  });

  await db.insert(tasks).values([projectRow, ...stepRows]);

  revalidatePath(APP_ROUTES.TASKS);

  return { projectTaskId, stepCount: stepRows.length };
}
