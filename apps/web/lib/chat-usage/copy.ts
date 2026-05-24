import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

export type ChatUsageState = 'healthy' | 'near_limit' | 'exhausted';

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
  if (data.isExhausted) return 'exhausted';
  if (data.isNearLimit) return 'near_limit';
  return 'healthy';
}

export function getChatUsageCopy(data: ChatUsageData): ChatUsageCopy {
  const pluralSuffix = data.remaining === 1 ? '' : 's';
  const state = getChatUsageState(data);

  if (state === 'exhausted') {
    const summaryDescription =
      data.plan === 'free'
        ? `You've used all ${data.dailyLimit} daily messages included in your plan. Upgrade to Pro for more messages each day.`
        : `You've used all ${data.dailyLimit} daily messages included in your plan. Come back tomorrow when your quota refreshes.`;

    return {
      state,
      planLabel: PLAN_LABELS[data.plan],
      statusLabel: 'Daily Limit Reached',
      headerLabel: 'Daily chat limit reached',
      headerAriaLabel:
        'Daily AI message limit reached. Open pricing to review upgrade options.',
      summaryTitle: "You've reached today's chat limit",
      summaryDescription,
      ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
    };
  }

  if (state === 'near_limit') {
    return {
      state,
      planLabel: PLAN_LABELS[data.plan],
      statusLabel: 'Near Daily Limit',
      headerLabel: `${data.remaining} message${pluralSuffix} left`,
      headerAriaLabel: `Only ${data.remaining} AI message${pluralSuffix} left today. Open pricing to review upgrade options.`,
      summaryTitle: "You're almost out of messages",
      summaryDescription: `You've sent ${data.used} of ${data.dailyLimit} daily messages. ${data.remaining} remaining today.`,
      ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
    };
  }

  return {
    state,
    planLabel: PLAN_LABELS[data.plan],
    statusLabel: 'Within Daily Limit',
    headerLabel: `${data.remaining} message${pluralSuffix} left`,
    headerAriaLabel: `${data.remaining} AI message${pluralSuffix} left today. Open pricing to review upgrade options.`,
    summaryTitle: "You're within today's chat limit",
    summaryDescription: `${data.remaining} of ${data.dailyLimit} daily messages remaining today.`,
    ctaLabel: data.plan === 'free' ? 'Upgrade to Pro' : 'View plans',
  };
}
