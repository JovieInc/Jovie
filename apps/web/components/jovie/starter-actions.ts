export const CHAT_STARTER_ACTION_ORDER = [
  'plan-release',
  'generate-album-art',
  'build-artist-profile',
  'review-signals',
] as const;

export type ChatStarterActionId = (typeof CHAT_STARTER_ACTION_ORDER)[number];

export interface ChatStarterActionDefinition {
  readonly id: ChatStarterActionId;
  readonly label: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly prompt: string;
  readonly icon: string;
  readonly accent: 'blue' | 'green' | 'purple' | 'orange';
  readonly telemetryKey: string;
}

/**
 * Canonical chat-home task vocabulary. Primary cards and secondary quick
 * actions derive their visible and analytics copy from this catalog so the
 * same intent cannot drift into competing names on one surface.
 */
export const CHAT_STARTER_ACTIONS: Readonly<
  Record<ChatStarterActionId, ChatStarterActionDefinition>
> = {
  'plan-release': {
    id: 'plan-release',
    label: 'Plan a Release',
    description: 'Map your next release timeline, assets, and launch moments.',
    actionLabel: 'Start Planning',
    prompt: 'Help me plan my next release.',
    icon: 'Disc3',
    accent: 'green',
    telemetryKey: 'plan_release',
  },
  'generate-album-art': {
    id: 'generate-album-art',
    label: 'Generate Album Art',
    description: 'Create cover concepts grounded in your current release.',
    actionLabel: 'Generate Art',
    prompt: 'Generate album art for my latest release.',
    icon: 'Camera',
    accent: 'purple',
    telemetryKey: 'generate_album_art',
  },
  'build-artist-profile': {
    id: 'build-artist-profile',
    label: 'Build Artist Profile',
    description: 'Complete your artist story, links, and release context.',
    actionLabel: 'Build Profile',
    prompt: 'Help me build my artist profile.',
    icon: 'Eye',
    accent: 'purple',
    telemetryKey: 'build_artist_profile',
  },
  'review-signals': {
    id: 'review-signals',
    label: 'Review Signals',
    description:
      'See what is gaining traction across your profile and catalog.',
    actionLabel: 'Review Signals',
    prompt: 'Help me see what is gaining traction right now.',
    icon: 'Link2',
    accent: 'blue',
    telemetryKey: 'review_signals',
  },
};

export function starterActionToSuggestion(
  id: ChatStarterActionId,
  prompt = CHAT_STARTER_ACTIONS[id].prompt
) {
  const action = CHAT_STARTER_ACTIONS[id];
  return {
    actionId: action.id,
    icon: action.icon,
    label: action.label,
    prompt,
    accent: action.accent,
    telemetryKey: action.telemetryKey,
  } as const;
}
