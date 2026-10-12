/**
 * Playbook templates for Tasks (JOV-7762).
 *
 * A playbook is a typed task list anchored to one target date (release day,
 * publish date, launch day). Each step carries a day offset from that date,
 * an owner, and an optional agent-assist hook that maps onto `tasks.agent_type`.
 * Instantiation writes ordinary `tasks` rows; no playbook-specific tables.
 */

import type { TaskDescriptionHelperPayload } from '@/lib/tasks/task-description-helper';
import type { TaskPriority } from '@/lib/tasks/types';

export const PLAYBOOK_IDS = [
  'music-release',
  'youtube-video',
  'podcast-episode',
  'book-launch',
] as const;
export type PlaybookId = (typeof PLAYBOOK_IDS)[number];

/** Who does the step. `jovie` steps are run by an agent workflow. */
export type PlaybookStepOwner = 'creator' | 'collaborator' | 'guest' | 'jovie';

/**
 * `agent_assisted`: at least one step is run by a shipped Jovie workflow.
 * `checklist_only`: Jovie schedules and tracks the steps; you do the work.
 */
export type PlaybookAssistMode = 'agent_assisted' | 'checklist_only';

export interface PlaybookAgentAssist {
  /** Stored as `tasks.agent_type`; must name a shipped workflow. */
  readonly agentType: string;
}

export interface PlaybookStep {
  /** Stable within a template version; stored in task metadata. */
  readonly id: string;
  readonly title: string;
  /** Grouping label, stored as `tasks.category`. */
  readonly phase: string;
  /** Days from the target date: negative = before, 0 = the day, positive = after. */
  readonly offsetDays: number;
  readonly owner: PlaybookStepOwner;
  readonly priority: TaskPriority;
  readonly description?: string;
  readonly explainerText?: string;
  readonly learnMoreUrl?: string;
  readonly descriptionHelper?: TaskDescriptionHelperPayload;
  readonly agentAssist?: PlaybookAgentAssist;
}

/** Where a researched template's steps come from. Summarized, never quoted. */
export interface PlaybookSource {
  readonly title: string;
  readonly author: string;
  readonly url: string;
}

export interface PlaybookTemplate {
  readonly id: PlaybookId;
  /** Bump when steps change; in-flight task lists keep the version they started from. */
  readonly version: number;
  readonly name: string;
  readonly summary: string;
  /** Label for the anchor date in the picker, e.g. "Release date". */
  readonly targetDateLabel: string;
  /** Placeholder for the project name field. */
  readonly projectNamePlaceholder: string;
  readonly assistMode: PlaybookAssistMode;
  /**
   * `release`: steps attach to a release and its date (agent workflows need
   * the release), so the plan starts from the release page.
   * `date`: steps attach to a parent task anchored to a picked date.
   */
  readonly anchor: 'release' | 'date';
  readonly sources: readonly PlaybookSource[];
  readonly steps: readonly PlaybookStep[];
}
