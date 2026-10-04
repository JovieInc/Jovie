import type { LaunchDecisionKind } from '@/lib/launch';
import { RECORD_RESULTS_STEP_ID, recordResultsStep } from './record-results';
import type { PlaybookTemplate } from './types';

const DECIDE_STEP_ID = 'decide-launch-size';
const BIND_CLAIMS_STEP_ID = 'bind-claims';

/**
 * Founder feature launch, anchored to announce day. Every merged PR is a
 * launch candidate; the lib/launch decision sizes it, and the kit (video,
 * thread, LinkedIn post, email, landing section, press note) binds every
 * claim to the PR. Built from the two dogfood kits Jovie shipped for its
 * own features. Checklist-only until a kit-drafting workflow ships.
 */
export const STARTUP_FEATURE_KIT_PLAYBOOK: PlaybookTemplate = {
  id: 'startup-feature-kit',
  version: 1,
  name: 'Startup Feature Launch',
  summary:
    'Turn a merged pull request into a launch kit: a 12-second video, a thread, a LinkedIn post, an email, a landing section and a press note.',
  targetDateLabel: 'Announce Date',
  projectNamePlaceholder: 'Feature name',
  origin: 'jovie',
  assistMode: 'checklist_only',
  anchor: 'date',
  intake: {
    kind: 'merged_pr',
    prompts: [
      'Which merged pull request is this launch about?',
      'Who is it for, and what can they do today that they could not do yesterday?',
      'Where can people try it right now?',
    ],
  },
  defaultAutonomy: 'review',
  iterative: true,
  sources: [],
  steps: [
    {
      id: DECIDE_STEP_ID,
      title: 'Decide how big this launch is',
      phase: 'Decide',
      offsetDays: -3,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'A full launch needs the feature live for users, a page to send people to and a channel you may post on. Otherwise it is a changelog note or a docs update.',
    },
    {
      id: BIND_CLAIMS_STEP_ID,
      title: 'Bind every claim to the pull request',
      phase: 'Decide',
      offsetDays: -3,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'List each claim next to the file, test or receipt that proves it. Cut any claim without one.',
    },
    {
      id: 'video',
      title: 'Cut a 12-second video in landscape and vertical',
      phase: 'Kit',
      offsetDays: -2,
      owner: 'creator',
      priority: 'high',
      channel: 'short_video',
    },
    {
      id: 'thread',
      title: 'Write the thread',
      phase: 'Kit',
      offsetDays: -2,
      owner: 'creator',
      priority: 'medium',
      channel: 'social',
    },
    {
      id: 'linkedin',
      title: 'Write the LinkedIn post',
      phase: 'Kit',
      offsetDays: -2,
      owner: 'creator',
      priority: 'medium',
      channel: 'social',
    },
    {
      id: 'email',
      title: 'Write the subscriber email',
      phase: 'Kit',
      offsetDays: -1,
      owner: 'creator',
      priority: 'high',
      channel: 'email',
    },
    {
      id: 'landing-section',
      title: 'Add the landing page section',
      phase: 'Kit',
      offsetDays: -1,
      owner: 'creator',
      priority: 'medium',
      channel: 'platform',
    },
    {
      id: 'press-note',
      title: 'Write the press note',
      phase: 'Kit',
      offsetDays: -1,
      owner: 'creator',
      priority: 'low',
      channel: 'press',
    },
    {
      id: 'changelog',
      title: 'Publish the changelog entry',
      phase: 'Announce',
      offsetDays: 0,
      owner: 'creator',
      priority: 'high',
      channel: 'platform',
    },
    {
      id: 'post-and-send',
      title: 'Post the thread and send the email',
      phase: 'Announce',
      offsetDays: 0,
      owner: 'creator',
      priority: 'urgent',
      channel: 'social',
    },
    {
      id: 'reply',
      title: 'Reply to everyone who responds',
      phase: 'Announce',
      offsetDays: 1,
      owner: 'creator',
      priority: 'medium',
      channel: 'community',
    },
    recordResultsStep(7, 'Announce'),
  ],
};

/**
 * Which kit steps a launch decision calls for. Smaller decisions keep the
 * evidence work and the loop, and drop the outputs they do not need.
 */
const STEPS_BY_DECISION: Readonly<
  Record<LaunchDecisionKind, readonly string[] | 'all'>
> = {
  coordinated_launch: 'all',
  tutorial_demo: ['video', 'landing-section', 'changelog'],
  changelog_notice: ['changelog'],
  doc_update: [],
  no_action: [],
};

export function featureKitStepIdsForDecision(
  kind: LaunchDecisionKind
): readonly string[] {
  const allIds = STARTUP_FEATURE_KIT_PLAYBOOK.steps.map(step => step.id);
  const chosen = STEPS_BY_DECISION[kind];
  if (chosen === 'all') return allIds;
  if (chosen.length === 0) return [];
  const keep = new Set([
    DECIDE_STEP_ID,
    BIND_CLAIMS_STEP_ID,
    ...chosen,
    RECORD_RESULTS_STEP_ID,
  ]);
  return allIds.filter(id => keep.has(id));
}
