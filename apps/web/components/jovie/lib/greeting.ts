import type { InsightResponse } from '@/types/insights';
import type { ArtistContext } from '../types';

export interface GreetingContent {
  readonly label: string;
  readonly body: string;
  readonly profileHref: string | null;
  readonly profileLabel: string | null;
}

interface BuildGreetingParams {
  readonly username?: string;
  readonly isFirstSession: boolean;
  readonly insights: readonly InsightResponse[];
  readonly tippingStats: ArtistContext['tippingStats'];
}

function ensureSentence(text: string) {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return '';
  }

  return /[.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}.`;
}

function getPaymentLabel(tipsSubmitted: number) {
  return tipsSubmitted === 1 ? 'payment' : 'payments';
}

export function buildGreeting({
  username,
  isFirstSession,
  insights,
  tippingStats,
}: BuildGreetingParams): GreetingContent {
  if (isFirstSession) {
    const trimmedUsername = username?.trim();
    const profileLabel =
      trimmedUsername && trimmedUsername.length > 0
        ? `jov.ie/${trimmedUsername}`
        : 'jov.ie';

    return {
      label: 'Artist ready',
      body: 'Your profile is live at',
      profileHref: trimmedUsername
        ? `https://jov.ie/${trimmedUsername}`
        : 'https://jov.ie',
      profileLabel,
    };
  }

  const topInsight = insights.find(insight => insight.title.trim().length > 0);
  if (topInsight) {
    return {
      label: 'Welcome back',
      body: ensureSentence(topInsight.title),
      profileHref: null,
      profileLabel: null,
    };
  }

  if (tippingStats.tipsSubmitted > 0) {
    return {
      label: 'Welcome back',
      body: `You've received ${tippingStats.tipsSubmitted} ${getPaymentLabel(tippingStats.tipsSubmitted)} since your last check-in.`,
      profileHref: null,
      profileLabel: null,
    };
  }

  return {
    label: 'Welcome back',
    body: 'Share your profile to start building your audience.',
    profileHref: null,
    profileLabel: null,
  };
}
