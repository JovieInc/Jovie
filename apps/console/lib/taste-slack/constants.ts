/** Aria — only authoritative voter for taste inbox Slack cards. */
export const TASTE_AUTHORITY_SLACK_USER_ID = 'U0B8QSEL6PL';

/** Build/design agent — reflexively adds both reactions; always ignored. */
export const TASTE_BUILD_AGENT_SLACK_USER_ID = 'U0B8AV5P92B';

export const TASTE_SLACK_APPROVE_REACTION = '+1';
export const TASTE_SLACK_REJECT_REACTION = '-1';

export const TASTE_SLACK_REACTIONS = [
  TASTE_SLACK_APPROVE_REACTION,
  TASTE_SLACK_REJECT_REACTION,
] as const;
