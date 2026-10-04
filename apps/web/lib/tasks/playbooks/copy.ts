/**
 * Product UI copy for the Tasks playbook picker. Linted against the
 * `jovie-product-ui` register of @jovie/copy in copy.test.ts.
 */

import type { LaunchDecisionKind } from '@/lib/launch';
import type { PlaybookAssistMode, PlaybookAutonomy } from './types';

export const PLAYBOOK_PICKER_COPY = {
  trigger: 'Start From a Playbook',
  title: 'Start From a Playbook',
  description:
    'Pick a playbook and a date. Jovie schedules every step back from that day.',
  listLabel: 'Playbooks',
  suggested: 'Suggested',
  nameLabel: 'Name',
  sourcesLabel: 'Sources',
  submit: 'Create Tasks',
  submitPending: 'Creating...',
  cancel: 'Cancel',
  releaseAnchorNote:
    'A release plan lives on the release, so its steps follow the release date.',
  releaseAnchorAction: 'Open Releases',
  error: "Couldn't start the playbook. Try again.",
  intakeLabel: 'Tell Jovie the story',
  intakeLabelPullRequest: 'Point Jovie at the change',
  intakeHint: 'Optional, but plans built from your own words land better.',
  autonomyLabel: 'How Hands-On',
  launchSizeLabel: 'Launch Size',
} as const;

export const PLAYBOOK_AUTONOMY_LABEL: Readonly<
  Record<PlaybookAutonomy, string>
> = {
  autopilot: 'Autopilot',
  review: 'Review Each',
  hands_on: 'Hands-On',
};

export const PLAYBOOK_AUTONOMY_DESCRIPTION: Readonly<
  Record<PlaybookAutonomy, string>
> = {
  autopilot: 'Jovie runs its steps and reports back.',
  review: 'Jovie drafts its steps. You approve each one.',
  hands_on: 'You do the work. Jovie helps when you ask.',
};

/** Launch sizes a founder can pick for a feature kit, biggest first. */
export const PLAYBOOK_LAUNCH_SIZES: ReadonlyArray<
  readonly [LaunchDecisionKind, string]
> = [
  ['coordinated_launch', 'Full Launch'],
  ['tutorial_demo', 'Demo and Tutorial'],
  ['changelog_notice', 'Changelog Note'],
];

export const PLAYBOOK_ASSIST_LABEL: Readonly<
  Record<PlaybookAssistMode, string>
> = {
  agent_assisted: 'Jovie Assists',
  checklist_only: 'Checklist Only',
};

export const PLAYBOOK_ASSIST_DESCRIPTION: Readonly<
  Record<PlaybookAssistMode, string>
> = {
  agent_assisted: 'Jovie runs some steps for you.',
  checklist_only: 'Jovie schedules and tracks the steps. You do the work.',
};

export function playbookStepCountLabel(count: number): string {
  return count === 1 ? '1 Step' : `${count} Steps`;
}

export function playbookStartedToast(count: number, name: string): string {
  return `Added ${count} tasks for ${name}.`;
}
