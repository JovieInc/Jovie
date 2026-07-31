/**
 * Onboarding wow-moment presence-build queue (JOV-3988).
 *
 * Seeds real post-signup tasks into workflow_runs and surfaces live tool
 * artifacts in the welcome chat. Kill-switched via APP flag
 * ONBOARDING_WOW_TASK_QUEUE.
 */

export const ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND =
  'onboarding_presence_build' as const;

export const PRESENCE_BUILD_STEPS = [
  'research_artist',
  'assemble_profile',
  'generate_smart_link',
  'draft_welcome_post',
] as const;

export type PresenceBuildStepId = (typeof PRESENCE_BUILD_STEPS)[number];

/** Tool names persisted on chat_messages.tool_calls for each step. */
export const PRESENCE_BUILD_TOOL_NAMES = {
  research_artist: 'researchArtistPresence',
  assemble_profile: 'assembleArtistProfile',
  generate_smart_link: 'generateSmartLink',
  draft_welcome_post: 'draftWelcomePost',
} as const satisfies Record<PresenceBuildStepId, string>;

export const PRESENCE_BUILD_STEP_LABELS = {
  research_artist: 'Research Artist',
  assemble_profile: 'Assemble Profile',
  generate_smart_link: 'Generate Smart Link',
  draft_welcome_post: 'Draft Welcome Post',
} as const satisfies Record<PresenceBuildStepId, string>;
