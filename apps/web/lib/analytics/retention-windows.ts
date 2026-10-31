/**
 * Retention windows quoted by policy and used by analytics cleanup.
 * One assignment each. Rendered copy uses {{DEFAULT_RETENTION_DAYS}} and
 * {{CHAT_RETENTION_DAYS}}; applyMarkdownTemplate fills them from here.
 */

export const DEFAULT_RETENTION_DAYS = 90;
export const CHAT_RETENTION_DAYS = 365;
