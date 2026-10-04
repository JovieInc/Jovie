import {
  DEFAULT_RELEASE_TASK_TEMPLATE,
  type DefaultTemplateItem,
} from '@/lib/release-tasks/default-template';
import type { PlaybookChannel, PlaybookStep, PlaybookTemplate } from './types';

const CHANNEL_BY_CATEGORY: Readonly<Record<string, PlaybookChannel>> = {
  'DSP Pitching': 'platform',
  'DSP Profile': 'platform',
  Platform: 'platform',
  Press: 'press',
  'Fan Engagement': 'email',
};

export function slugifyStepTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toPlaybookStep(item: DefaultTemplateItem): PlaybookStep {
  return {
    id: slugifyStepTitle(item.title),
    title: item.title,
    phase: item.category,
    offsetDays: item.dueDaysOffset,
    owner: item.assigneeType === 'ai_workflow' ? 'jovie' : 'creator',
    priority: item.priority,
    description: item.description,
    explainerText: item.explainerText,
    learnMoreUrl: item.learnMoreUrl,
    descriptionHelper: item.descriptionHelper,
    agentAssist: item.aiWorkflowId
      ? { agentType: item.aiWorkflowId }
      : undefined,
    channel: CHANNEL_BY_CATEGORY[item.category],
  };
}

/**
 * The release plan Jovie has always generated, expressed as a playbook.
 * Source of truth stays DEFAULT_RELEASE_TASK_TEMPLATE so the per-release
 * workspace and the Tasks picker can never drift apart.
 */
export const MUSIC_RELEASE_PLAYBOOK: PlaybookTemplate = {
  id: 'music-release',
  version: 1,
  name: 'Music Release',
  summary:
    'Distribution, editorial pitching, profile updates and release-day fan alerts for a single or album.',
  targetDateLabel: 'Release Date',
  projectNamePlaceholder: 'Single or album title',
  origin: 'jovie',
  assistMode: 'agent_assisted',
  anchor: 'release',
  intake: { kind: 'none' },
  defaultAutonomy: 'review',
  iterative: true,
  sources: [],
  steps: DEFAULT_RELEASE_TASK_TEMPLATE.map(toPlaybookStep),
};
