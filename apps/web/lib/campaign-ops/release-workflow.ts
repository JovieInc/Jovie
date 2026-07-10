/**
 * Release workflow system from playbooks (JOV-2213).
 *
 * Expands a versioned playbook into a canonical per-release workflow with
 * stable task dedupe keys so repeated imports do not duplicate work.
 */

import type {
  ReleasePlaybookTemplate,
  ReleaseWorkflowInstance,
  ReleaseWorkflowTask,
} from './types';

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

/** Stable dedupe key: release + playbook version + task title slug. */
export function buildTaskDedupeKey(input: {
  readonly releaseId: string;
  readonly playbookId: string;
  readonly playbookVersion: string;
  readonly title: string;
}): string {
  return [
    slugPart(input.releaseId) || 'release',
    slugPart(input.playbookId) || 'playbook',
    slugPart(input.playbookVersion) || '0-0-0',
    slugPart(input.title) || 'task',
  ].join('::');
}

export function expandPlaybookToTasks(
  releaseId: string,
  playbook: ReleasePlaybookTemplate
): ReleaseWorkflowTask[] {
  return playbook.tasks.map(task => ({
    ...task,
    dedupeKey: buildTaskDedupeKey({
      releaseId,
      playbookId: playbook.id,
      playbookVersion: playbook.version,
      title: task.title,
    }),
    state: 'pending' as const,
  }));
}

/**
 * Merge expanded tasks into an existing workflow without duplicating keys.
 * Existing task state is preserved when keys match.
 */
export function mergeWorkflowTasks(
  existing: readonly ReleaseWorkflowTask[],
  incoming: readonly ReleaseWorkflowTask[]
): ReleaseWorkflowTask[] {
  const byKey = new Map<string, ReleaseWorkflowTask>();
  for (const task of existing) {
    byKey.set(task.dedupeKey, task);
  }
  for (const task of incoming) {
    if (!byKey.has(task.dedupeKey)) {
      byKey.set(task.dedupeKey, task);
    }
  }
  return [...byKey.values()];
}

export function createReleaseWorkflow(input: {
  readonly id: string;
  readonly releaseId: string;
  readonly playbook: ReleasePlaybookTemplate;
  readonly now?: string;
}): ReleaseWorkflowInstance {
  return {
    id: input.id,
    releaseId: input.releaseId,
    playbookId: input.playbook.id,
    playbookVersion: input.playbook.version,
    tasks: expandPlaybookToTasks(input.releaseId, input.playbook),
    createdAt: input.now ?? new Date().toISOString(),
  };
}

/**
 * Idempotent import: re-running the same release+playbook does not duplicate tasks.
 */
export function importReleasePlaybook(input: {
  readonly existing: ReleaseWorkflowInstance | null;
  readonly workflowId: string;
  readonly releaseId: string;
  readonly playbook: ReleasePlaybookTemplate;
  readonly now?: string;
}): { readonly workflow: ReleaseWorkflowInstance; readonly created: boolean } {
  if (
    input.existing &&
    input.existing.releaseId === input.releaseId &&
    input.existing.playbookId === input.playbook.id
  ) {
    const merged = mergeWorkflowTasks(
      input.existing.tasks,
      expandPlaybookToTasks(input.releaseId, input.playbook)
    );
    return {
      workflow: {
        ...input.existing,
        playbookVersion: input.playbook.version,
        tasks: merged,
      },
      created: false,
    };
  }

  return {
    workflow: createReleaseWorkflow({
      id: input.workflowId,
      releaseId: input.releaseId,
      playbook: input.playbook,
      now: input.now,
    }),
    created: true,
  };
}

/** Canonical music-industry single release playbook (versioned, auditable). */
export const DEFAULT_SINGLE_RELEASE_PLAYBOOK: ReleasePlaybookTemplate =
  Object.freeze({
    id: 'single-release-v1',
    version: '1.0.0',
    name: 'Single Release Operating System',
    tasks: Object.freeze([
      {
        title: 'Enter metadata (ISRC, UPC, credits, genres)',
        category: 'Distribution',
        dueDaysOffset: -30,
        assigneeType: 'human' as const,
      },
      {
        title: 'Create Jovie smart link',
        category: 'Platform',
        dueDaysOffset: -1,
        assigneeType: 'ai_workflow' as const,
      },
      {
        title: 'Configure pre-save / save flow',
        category: 'Platform',
        dueDaysOffset: -14,
        assigneeType: 'ai_workflow' as const,
      },
      {
        title: 'Draft press release',
        category: 'Press',
        dueDaysOffset: -21,
        assigneeType: 'human' as const,
      },
      {
        title: 'Pitch to Spotify editorial',
        category: 'Playlists',
        dueDaysOffset: -28,
        assigneeType: 'human' as const,
      },
      {
        title: 'Plan content assets',
        category: 'Content',
        dueDaysOffset: -14,
        assigneeType: 'human' as const,
      },
      {
        title: 'Send fan notification',
        category: 'Fan Engagement',
        dueDaysOffset: 0,
        assigneeType: 'ai_workflow' as const,
      },
      {
        title: 'Draft merch drop for release',
        category: 'Merch',
        dueDaysOffset: -7,
        assigneeType: 'ai_workflow' as const,
      },
      {
        title: 'Review first-week analytics',
        category: 'Reporting',
        dueDaysOffset: 7,
        assigneeType: 'human' as const,
      },
    ]),
  });
