import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { getWeeklyUsageModel } from './metrics';

export type ChatUsageState =
  | 'healthy'
  | 'near_limit'
  | 'exhausted'
  | 'unavailable';

export interface ChatUsageCopy {
  readonly state: ChatUsageState;
  readonly planLabel: string;
  readonly statusLabel: string;
  readonly headerLabel: string;
  readonly headerAriaLabel: string;
  readonly summaryTitle: string;
  readonly summaryDescription: string;
  readonly ctaLabel: string;
}

const PLAN_LABELS: Record<ChatUsageData['plan'], string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

function getChatUsageState(data: ChatUsageData): ChatUsageState {
  const model = getWeeklyUsageModel(data);
  if (!model) return 'unavailable';
  if (model.state === 'exhausted') return 'exhausted';
  if (model.state === 'warning') return 'near_limit';
  return 'healthy';
}

export function getChatUsageCopy(data: ChatUsageData): ChatUsageCopy {
  const pluralSuffix = data.remaining === 1 ? '' : 's';
  const state = getChatUsageState(data);

  if (state === 'unavailable') {
    return {
      state,
      planLabel: PLAN_LABELS[data.plan],
      statusLabel: 'Usage Unavailable',
      headerLabel: 'Usage unavailable',
      headerAriaLabel: 'AI message usage is unavailable right now.',
      summaryTitle: 'Usage is temporarily unavailable',
      summaryDescription:
        'We could not verify the current message balance. Refresh before relying on this quota.',
      ctaLabel: 'View plans',
    };
  }

  if (state === 'exhausted') {
    const summaryDescription =
      data.plan === 'free'
        ? `You've used all ${data.weeklyLimit} weekly messages included in your plan. Upgrade to Pro for more messages each week.`
        : `You've used all ${data.weeklyLimit} weekly messages included in your plan. Your messages refresh when the current window ends.`;

    return {
      state,
      planLabel: PLAN_LABELS[data.plan],
      statusLabel: 'Weekly Limit Reached',
      headerLabel: 'Weekly chat limit reached',
      headerAriaLabel:
        'Weekly AI message limit reached. Open pricing to review upgrade options.',
      summaryTitle: "You've reached this week's chat limit",
      summaryDescription,
      ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
    };
  }

  if (state === 'near_limit') {
    return {
      state,
      planLabel: PLAN_LABELS[data.plan],
      statusLabel: 'Near Weekly Limit',
      headerLabel: `${data.remaining} message${pluralSuffix} left`,
      headerAriaLabel: `Only ${data.remaining} AI message${pluralSuffix} left this week. Open pricing to review upgrade options.`,
      summaryTitle: "You're almost out of messages",
      summaryDescription: `You've sent ${data.used} of ${data.weeklyLimit} weekly messages. ${data.remaining} remaining this week.`,
      ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
    };
  }

  return {
    state,
    planLabel: PLAN_LABELS[data.plan],
    statusLabel: 'Within Weekly Limit',
    headerLabel: `${data.remaining} message${pluralSuffix} left`,
    headerAriaLabel: `${data.remaining} AI message${pluralSuffix} left this week. Open pricing to review upgrade options.`,
    summaryTitle: "You're within this week's chat limit",
    summaryDescription: `${data.remaining} of ${data.weeklyLimit} weekly messages remaining this week.`,
    ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
  };
}
