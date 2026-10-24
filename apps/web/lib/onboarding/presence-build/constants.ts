/** JOV-3988 presence-build queue; kill-switch ONBOARDING_WOW_TASK_QUEUE. */

export const ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND =
  'onboarding_presence_build' as const;

export const PRESENCE_BUILD_STEPS = [
  'research_artist',
  // JOV-7750: link-drift computed proof, the most persuasive judged finding.
  'check_link_drift',
  'surface_library_opportunities',
  'assemble_profile',
  'generate_smart_link',
  'draft_welcome_post',
] as const;

export type PresenceBuildStepId = (typeof PRESENCE_BUILD_STEPS)[number];

/** Tool names persisted on chat_messages.tool_calls for each step. */
export const PRESENCE_BUILD_TOOL_NAMES = {
  research_artist: 'researchArtistPresence',
  check_link_drift: 'checkLinkDrift',
  surface_library_opportunities: 'surfaceLibraryOpportunities',
  assemble_profile: 'assembleArtistProfile',
  generate_smart_link: 'generateSmartLink',
  draft_welcome_post: 'draftWelcomePost',
} as const satisfies Record<PresenceBuildStepId, string>;

export const PRESENCE_BUILD_STEP_LABELS = {
  research_artist: 'Research artist',
  check_link_drift: 'Check bio links',
  surface_library_opportunities: 'Surface work opportunities',
  assemble_profile: 'Assemble profile',
  generate_smart_link: 'Generate smart link',
  draft_welcome_post: 'Draft welcome post',
} as const satisfies Record<PresenceBuildStepId, string>;
