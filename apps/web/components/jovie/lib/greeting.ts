import type { InsightResponse } from '@/types/insights';
import type { ArtistContext } from '../types';

export interface GreetingContent {
  readonly label: string;
  readonly body: string;
  readonly profileHref: string | null;
  readonly profileLabel: string | null;
}

interface BuildGreetingParams {
  readonly displayName?: string;
  readonly username?: string;
  readonly isFirstSession: boolean;
  readonly insights: readonly InsightResponse[];
  readonly tippingStats: ArtistContext['tippingStats'];
}

function getDisplayName(displayName?: string) {
  const trimmedDisplayName = displayName?.trim();
  return trimmedDisplayName && trimmedDisplayName.length > 0
    ? trimmedDisplayName
    : 'there';
}

function ensureSentence(text: string) {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return '';
  }

  return /[.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}.`;
}

function getTipLabel(tipsSubmitted: number) {
  return tipsSubmitted === 1 ? 'tip' : 'tips';
}

export function buildGreeting({
  displayName,
  username,
  isFirstSession,
  insights,
  tippingStats,
}: BuildGreetingParams): GreetingContent {
  const resolvedDisplayName = getDisplayName(displayName);

  if (isFirstSession) {
    const trimmedUsername = username?.trim();
    const profileLabel =
      trimmedUsername && trimmedUsername.length > 0
        ? `jov.ie/${trimmedUsername}`
        : 'jov.ie';

    return {
      label: 'Artist ready',
      body: `Welcome, ${resolvedDisplayName}. Your profile is live at`,
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
      body: `Welcome back, ${resolvedDisplayName}. ${ensureSentence(topInsight.title)}`,
      profileHref: null,
      profileLabel: null,
    };
  }

  if (tippingStats.tipsSubmitted > 0) {
    return {
      label: 'Welcome back',
      body: `Welcome back, ${resolvedDisplayName}. You've received ${tippingStats.tipsSubmitted} ${getTipLabel(tippingStats.tipsSubmitted)} since you last checked in.`,
      profileHref: null,
      profileLabel: null,
    };
  }

  return {
    label: 'Welcome back',
    body: `Welcome back, ${resolvedDisplayName}. Share your profile link to start building your audience.`,
    profileHref: null,
    profileLabel: null,
  };
}
