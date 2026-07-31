/**
 * Shared constants for the /roadmap CLI.
 * Team ID matches scripts/backlog-orchestrator/config.json.
 */

export const TEAM_KEY = 'JOV';
export const TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

/** Default AgentOS initiative name used when resolving projects/issues. */
export const AGENTOS_INITIATIVE_NAME = 'AgentOS';

export const LABEL_AGENTOS = 'agentos';
export const LABEL_HUMAN_REVIEW = 'human-review-required';

export const DEFAULT_BACKLOG_PATH = 'agentos/roadmap/backlog.json';

/** Active work states surfaced by `today`. */
export const TODAY_STATE_NAMES = Object.freeze([
  'Todo',
  'In Progress',
  'In Review',
]);

/** Linear state types considered "active" for agent scheduling. */
export const ACTIVE_STATE_TYPES = Object.freeze([
  'unstarted',
  'started',
  'triage',
]);

/**
 * Minimum forbidden actions for agent-briefs (SYNC_MODEL §4.3)
 * unless human approval is required and cleared.
 */
export const DEFAULT_FORBIDDEN_ACTIONS = Object.freeze([
  'mutate_production_data',
  'change_auth',
  'change_billing',
  'change_security',
]);

export const DEFAULT_ALLOWED_ACTIONS = Object.freeze([
  'read',
  'classify',
  'rank',
  'summarize',
  'draft',
  'write_code',
  'open_pr',
]);
