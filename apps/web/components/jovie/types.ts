export interface ArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

export interface JovieChatProps {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext;
  /** Conversation ID to load and continue */
  readonly conversationId?: string | null;
  /** Callback when a new conversation is created */
  readonly onConversationCreate?: (conversationId: string) => void;
  /** Pre-fill and auto-submit a message on mount (e.g. from ?q= param) */
  readonly initialQuery?: string;
}

export type ChatErrorType = 'network' | 'rate_limit' | 'server' | 'unknown';

export interface ChatError {
  readonly type: ChatErrorType;
  readonly message: string;
  readonly retryAfter?: number;
  readonly errorCode?: string;
  readonly failedMessage?: string;
}

/** Maximum allowed message length */
export const MAX_MESSAGE_LENGTH = 4000;

/** Minimum time between message submissions (ms) */
export const SUBMIT_THROTTLE_MS = 1000;

export interface MessagePart {
  readonly type: string;
  readonly text?: string;
}

/** A chat suggestion card with icon, label, and prompt */
export interface ChatSuggestion {
  /** Lucide icon name used to render the icon */
  readonly icon: string;
  /** Short label displayed on the card */
  readonly label: string;
  /** The actual prompt sent to chat when clicked */
  readonly prompt: string;
  /** Accent color for the icon background */
  readonly accent: 'blue' | 'green' | 'purple' | 'orange';
}

/**
 * Default suggestions shown on the empty chat state.
 * These are the 3 most universally useful starter tasks.
 */
export const DEFAULT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: 'UserSearch',
    label: 'Review my profile and suggest improvements',
    prompt:
      'Review my full profile — bio, genres, links, and stats — and suggest specific improvements I should make.',
    accent: 'purple',
  },
  {
    icon: 'BarChart3',
    label: 'Break down my stats and what they mean',
    prompt:
      'Break down all my current stats — Spotify followers, popularity, profile views, tip revenue — and tell me what they mean for my career.',
    accent: 'blue',
  },
  {
    icon: 'Target',
    label: 'Give me 3 things to focus on this week',
    prompt:
      'Based on my profile and stats, give me 3 specific, actionable things I should focus on this week to grow.',
    accent: 'orange',
  },
] as const;

/**
 * Full catalog of starter suggestions, organized by category.
 * Used for "Explore more" or rotating suggestions.
 */
export const ALL_SUGGESTIONS: readonly ChatSuggestion[] = [
  // --- Profile & Bio ---
  {
    icon: 'PenLine',
    label: 'Rewrite my bio to sound more compelling',
    prompt:
      'Rewrite my artist bio to be more compelling and authentic. Propose the edit so I can review it.',
    accent: 'purple',
  },
  {
    icon: 'Music',
    label: 'Suggest better genres for my profile',
    prompt:
      'Look at my current genres and suggest better ones that fit my music and help with discoverability. Propose the changes.',
    accent: 'purple',
  },
  {
    icon: 'UserSearch',
    label: 'Review my profile and suggest improvements',
    prompt:
      'Review my full profile — bio, genres, links, and stats — and suggest specific improvements I should make.',
    accent: 'purple',
  },
  {
    icon: 'Sparkles',
    label: 'Make my display name stand out more',
    prompt:
      'Is my display name working well? Suggest alternatives that are more memorable and searchable.',
    accent: 'purple',
  },

  // --- Analytics & Insights ---
  {
    icon: 'BarChart3',
    label: 'Break down my stats and what they mean',
    prompt:
      'Break down all my current stats — Spotify followers, popularity, profile views, tip revenue — and tell me what they mean for my career.',
    accent: 'blue',
  },
  {
    icon: 'TrendingUp',
    label: "What's working best on my profile?",
    prompt:
      "Based on my analytics, what's currently working best on my profile? What should I double down on?",
    accent: 'blue',
  },
  {
    icon: 'Activity',
    label: 'Compare my Spotify stats to my profile traffic',
    prompt:
      'How do my Spotify followers and popularity compare to my profile views and engagement? What does the gap tell me?',
    accent: 'blue',
  },

  // --- Growth & Strategy ---
  {
    icon: 'Target',
    label: 'Give me 3 things to focus on this week',
    prompt:
      'Based on my profile and stats, give me 3 specific, actionable things I should focus on this week to grow.',
    accent: 'orange',
  },
  {
    icon: 'Eye',
    label: 'How can I get more profile views?',
    prompt:
      'My profile views are where they are — what are concrete steps I can take to drive more people to my profile?',
    accent: 'orange',
  },
  {
    icon: 'Users',
    label: 'Help me build a bigger fanbase',
    prompt:
      'Based on where I am right now, what is the most effective strategy for me to grow my fanbase?',
    accent: 'orange',
  },
  {
    icon: 'Calendar',
    label: 'Help me plan content for this week',
    prompt:
      'Help me plan out what I should post and share this week across my platforms to grow engagement.',
    accent: 'orange',
  },
  {
    icon: 'Rocket',
    label: "What's holding me back from growing?",
    prompt:
      "Look at my profile, stats, and links. What's the biggest thing holding me back from growing right now?",
    accent: 'orange',
  },

  // --- Monetization ---
  {
    icon: 'DollarSign',
    label: 'How can I earn more from tips?',
    prompt:
      'Look at my tipping stats — clicks, submissions, revenue. What can I do to increase my tip earnings?',
    accent: 'green',
  },
  {
    icon: 'CircleDollarSign',
    label: 'Why are people clicking but not tipping?',
    prompt:
      'My tip link gets clicks but not many submissions. Why might that be, and how can I improve the conversion?',
    accent: 'green',
  },

  // --- Links & Presence ---
  {
    icon: 'Link',
    label: 'Am I missing any important links?',
    prompt:
      'Check my current link setup — social links and music links. Am I missing any important platforms I should add?',
    accent: 'blue',
  },
  {
    icon: 'Globe',
    label: 'Which platforms should I prioritize?',
    prompt:
      'Given my stats and where my audience is, which platforms should I be most active on right now?',
    accent: 'blue',
  },
] as const;
