/**
 * Minimum data thresholds for insight generation.
 *
 * Insights should only generate when there's sufficient data for meaningful
 * analysis. Generating insights on sparse data erodes user trust.
 */

/** Minimum total click events for any insights to be generated */
export const MIN_TOTAL_CLICKS = 20;

/** Minimum days of data history required */
export const MIN_HISTORY_DAYS = 7;

/** Minimum clicks from a city to include it in geographic insights */
export const MIN_CITY_CLICKS = 10;

/** Minimum events in previous period for growth comparison */
export const MIN_PREVIOUS_PERIOD = 10;

/** Minimum total subscribers for subscriber-related insights */
export const MIN_SUBSCRIBERS = 3;

/** Minimum total tips for revenue-related insights */
export const MIN_TIPS = 3;

/** Minimum events with temporal data for timing insights */
export const MIN_TEMPORAL_EVENTS = 50;

/** Minimum total link clicks for platform insights */
export const MIN_LINK_CLICKS = 20;

/** Minimum audience members with geo data for tour insights */
export const MIN_AUDIENCE_FOR_TOUR = 50;

/** Maximum insights per generation run */
export const MAX_INSIGHTS_PER_RUN = 8;

/** Rate limit: minimum hours between generation runs per user */
export const GENERATION_COOLDOWN_HOURS = 1;

/** Maximum profiles to process per cron batch */
export const MAX_CRON_BATCH_SIZE = 100;

/** Minimum confidence score for an insight to be stored */
export const MIN_CONFIDENCE = 0.5;

/** Default period length in days for analysis */
export const DEFAULT_PERIOD_DAYS = 30;

/** Expiration days by priority level */
export const EXPIRATION_DAYS: Record<string, number> = {
  high: 7,
  medium: 14,
  low: 30,
};
