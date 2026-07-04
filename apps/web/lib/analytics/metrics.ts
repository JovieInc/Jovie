/**
 * Canonical metrics layer — the single source of truth for every analytics
 * formula in Jovie.
 *
 * Every metric is defined exactly once here: name, precise definition, the
 * source table(s)/SQL fragment that produces it, its value type, and its
 * unit. All surfaces (dashboard, public profile, audience sidebar, tour
 * dates) consume from this layer; no surface computes its own aggregates or
 * derived rates.
 *
 * Rules enforced by `tests/unit/analytics-metrics-layer-guard.test.ts`:
 * - Raw SQL aggregates over analytics event tables (`click_events`,
 *   `daily_profile_views`, `notification_subscriptions`) may not be added
 *   outside the baselined query files.
 * - Derived rates (CTR, capture rate, any `(a / b) * 100`) may not be
 *   computed ad-hoc in handlers or components — import the derivation
 *   helpers below instead.
 *
 * Display labels/tooltips for the dashboard read from
 * `lib/analytics/metric-definitions.ts`, which is itself derived from this
 * module.
 */

/** How a metric's value is produced. */
export type MetricValueType = 'count' | 'rate';

/** The unit a metric is expressed in. */
export type MetricUnit = 'views' | 'people' | 'clicks' | 'percent';

export interface CanonicalMetricDefinition {
  /** Human-readable canonical name. */
  readonly label: string;
  /** One-line plain-language definition. */
  readonly definition: string;
  /**
   * Source table(s) / SQL fragment that produces this metric. For derived
   * rates, the formula in terms of other canonical metrics.
   */
  readonly source: string;
  readonly valueType: MetricValueType;
  readonly unit: MetricUnit;
}

/** Every canonical analytics metric key. */
export type CanonicalMetricKey =
  | 'profile_views'
  | 'unique_views'
  | 'unique_users'
  | 'total_clicks'
  | 'listen_clicks'
  | 'social_clicks'
  | 'tip_link_visits'
  | 'ticket_clicks'
  | 'subscribers'
  | 'identified_users'
  | 'ctr'
  | 'capture_rate';

export const CANONICAL_METRICS: Record<
  CanonicalMetricKey,
  CanonicalMetricDefinition
> = {
  profile_views: {
    label: 'Profile Views',
    definition:
      'Total page visits, including repeat visits from the same person.',
    source:
      'daily_profile_views: SUM(view_count) WHERE creator_profile_id = :profileId AND view_date >= :startDate',
    valueType: 'count',
    unit: 'views',
  },
  unique_views: {
    label: 'Unique Views',
    definition:
      'Distinct non-bot audience members/fingerprints active in the selected range.',
    source:
      'audience_members: COUNT(*) WHERE creator_profile_id = :profileId AND last_seen_at >= :startDate AND NOT (tags @> \'["bot"]\')',
    valueType: 'count',
    unit: 'people',
  },
  unique_users: {
    label: 'Unique Visitors',
    definition:
      'Individual people who visited your profile, counted once per person.',
    source:
      'audience_members: COUNT(*) WHERE creator_profile_id = :profileId AND last_seen_at >= :startDate',
    valueType: 'count',
    unit: 'people',
  },
  total_clicks: {
    label: 'Total Clicks',
    definition: 'All link clicks on your profile across the selected period.',
    source:
      'click_events: COUNT(*) WHERE creator_profile_id = :profileId AND is_bot = false AND created_at >= :startDate',
    valueType: 'count',
    unit: 'clicks',
  },
  listen_clicks: {
    label: 'Listen Clicks',
    definition:
      'Clicks on streaming links (Spotify, Apple Music, etc.) from your profile.',
    source: "click_events: COUNT(*) … AND link_type = 'listen'",
    valueType: 'count',
    unit: 'clicks',
  },
  social_clicks: {
    label: 'Social Clicks',
    definition: 'Clicks on social links from your profile.',
    source: "click_events: COUNT(*) … AND link_type = 'social'",
    valueType: 'count',
    unit: 'clicks',
  },
  tip_link_visits: {
    label: 'Tip Link Visits',
    definition: 'Visits to your tipping page from your profile.',
    source: "click_events: COUNT(*) … AND link_type = 'tip'",
    valueType: 'count',
    unit: 'clicks',
  },
  ticket_clicks: {
    label: 'Ticket Clicks',
    definition: 'Clicks on ticket links for a specific tour date.',
    source:
      "click_events: COUNT(*) WHERE metadata->>'contentType' = 'tour_date' AND metadata->>'contentId' = :tourDateId AND is_bot = false",
    valueType: 'count',
    unit: 'clicks',
  },
  subscribers: {
    label: 'Followers',
    definition:
      'Fans who opted in to notifications — your capturable audience.',
    source:
      'notification_subscriptions: COUNT(*) WHERE creator_profile_id = :profileId AND created_at >= :startDate',
    valueType: 'count',
    unit: 'people',
  },
  identified_users: {
    label: 'Identified Users',
    definition:
      'Visitors matched to a known fan record with an email or phone number.',
    source:
      'audience_members: COUNT(*) WHERE creator_profile_id = :profileId AND updated_at >= :startDate AND email IS NOT NULL',
    valueType: 'count',
    unit: 'people',
  },
  ctr: {
    label: 'Click-Through Rate',
    definition:
      'Percentage of profile views that resulted in a link click (total clicks ÷ profile views).',
    source: 'derived: (total_clicks / profile_views) * 100',
    valueType: 'rate',
    unit: 'percent',
  },
  capture_rate: {
    label: 'Capture Rate',
    definition:
      'Percentage of unique visitors who became followers (subscribers ÷ unique visitors).',
    source: 'derived: (subscribers / unique_users) * 100',
    valueType: 'rate',
    unit: 'percent',
  },
};

// ─── Derived-rate helpers (the ONLY place rates are computed) ───────────

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Generic percentage rate: (numerator / denominator) * 100, rounded.
 * Returns 0 when the denominator is not positive (no division by zero).
 */
export function computeRatePercent(
  numerator: number,
  denominator: number,
  decimals = 1
): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  if (!Number.isFinite(numerator)) return 0;
  return roundToDecimals((numerator / denominator) * 100, decimals);
}

/**
 * Capture rate: percentage of unique visitors who became followers.
 * Canonical formula: (subscribers / unique_users) * 100.
 */
export function computeCaptureRate(
  subscribers: number,
  uniqueUsers: number,
  decimals = 1
): number {
  return computeRatePercent(subscribers, uniqueUsers, decimals);
}

/**
 * Click-through rate: percentage of profile views that produced a click.
 * Canonical formula: (total_clicks / profile_views) * 100.
 */
export function computeCtr(
  totalClicks: number,
  profileViews: number,
  decimals = 1
): number {
  return computeRatePercent(totalClicks, profileViews, decimals);
}

/**
 * Share of total views that came from unique visitors.
 * Canonical formula: (unique_users / profile_views) * 100.
 */
export function computeUniqueVisitorShare(
  uniqueUsers: number,
  profileViews: number,
  decimals = 0
): number {
  return computeRatePercent(uniqueUsers, profileViews, decimals);
}
