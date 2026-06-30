/**
 * Canonical analytics metric definitions — single source of truth for labels,
 * one-line definitions, and invariant guards used across analytics UIs.
 *
 * Every metric shown in the dashboard reads its label and definition from here.
 * Guards prevent displaying logically impossible number combinations.
 */

export interface MetricDefinition {
  readonly label: string;
  /** One-line plain-language definition shown in tooltip/help UI. */
  readonly definition: string;
}

/** All dashboard analytics metric keys. */
export type DashboardMetricKey =
  | 'profile_views'
  | 'unique_users'
  | 'subscribers'
  | 'capture_rate'
  | 'listen_clicks'
  | 'identified_users'
  | 'total_clicks'
  | 'tip_link_visits';

export const METRIC_DEFINITIONS: Record<DashboardMetricKey, MetricDefinition> =
  {
    profile_views: {
      label: 'Profile Views',
      definition:
        'Total page visits, including repeat visits from the same person.',
    },
    unique_users: {
      label: 'Unique Visitors',
      definition:
        'Individual people who visited your profile, counted once per person.',
    },
    subscribers: {
      label: 'Followers',
      definition:
        'Fans who opted in to notifications — your capturable audience.',
    },
    capture_rate: {
      label: 'Capture Rate',
      definition:
        'Percentage of unique visitors who became followers (subscribers ÷ unique visitors).',
    },
    listen_clicks: {
      label: 'Listen Clicks',
      definition:
        'Clicks on streaming links (Spotify, Apple Music, etc.) from your profile.',
    },
    identified_users: {
      label: 'Identified Users',
      definition:
        'Visitors matched to a known fan record with an email or phone number.',
    },
    total_clicks: {
      label: 'Total Clicks',
      definition: 'All link clicks on your profile across the selected period.',
    },
    tip_link_visits: {
      label: 'Tip Link Visits',
      definition: 'Visits to your tipping page from your profile.',
    },
  };

/**
 * Analytics invariant guards.
 *
 * Returns a set of metric keys whose values are suspect because they violate
 * a known logical constraint. The UI should hide or mark these values instead
 * of displaying them as-is.
 *
 * Invariants:
 * - unique_users cannot exceed profile_views (deduplication only reduces the count)
 * - subscribers cannot exceed unique_users (fans must have visited first)
 * - listen_clicks cannot exceed total_clicks (listen is a subset of total)
 * - identified_users cannot exceed unique_users (identified is a subset of unique)
 * - capture_rate must be [0, 100] when unique_users > 0; undefined otherwise
 */
export function getContradictoryMetrics(metrics: {
  readonly profile_views?: number;
  readonly unique_users?: number;
  readonly subscribers?: number;
  readonly listen_clicks?: number;
  readonly total_clicks?: number;
  readonly identified_users?: number;
  readonly capture_rate?: number;
}): ReadonlySet<DashboardMetricKey> {
  const suspect = new Set<DashboardMetricKey>();

  const views = metrics.profile_views ?? 0;
  const unique = metrics.unique_users ?? 0;
  const subs = metrics.subscribers ?? 0;
  const listen = metrics.listen_clicks ?? 0;
  const total = metrics.total_clicks ?? 0;
  const identified = metrics.identified_users ?? 0;
  const captureRate = metrics.capture_rate ?? 0;

  // unique visitors > total views is impossible
  if (views === 0 && unique > 0) suspect.add('unique_users');
  if (unique > views && views > 0) suspect.add('unique_users');

  // subscribers > unique visitors is impossible
  if (unique === 0 && subs > 0) suspect.add('subscribers');
  if (subs > unique && unique > 0) suspect.add('subscribers');

  // listen clicks > total clicks is impossible (listen is a subset)
  // Also flag when total is absent but listen is non-zero (subset can't exceed missing total)
  if (total === 0 && listen > 0) suspect.add('listen_clicks');
  if (total > 0 && listen > total) suspect.add('listen_clicks');

  // identified users > unique visitors is impossible
  if (unique === 0 && identified > 0) suspect.add('identified_users');
  if (identified > unique && unique > 0) suspect.add('identified_users');

  // capture rate out of [0, 100] range
  if (unique > 0 && (captureRate < 0 || captureRate > 100))
    suspect.add('capture_rate');

  return suspect;
}

/**
 * Returns true when a metric value should display as an explicit empty state
 * rather than the raw number.
 *
 * A metric is "empty" when it's zero AND none of its upstream funnel metrics
 * are non-zero (to avoid the contradiction of "0 views but 4 clicks").
 */
export function isMetricEmpty(
  key: DashboardMetricKey,
  metrics: {
    readonly profile_views?: number;
    readonly unique_users?: number;
    readonly subscribers?: number;
    readonly listen_clicks?: number;
    readonly total_clicks?: number;
    readonly identified_users?: number;
    readonly capture_rate?: number;
    readonly tip_link_visits?: number;
  }
): boolean {
  const v = metrics[key];
  if (v === undefined || v === null || v > 0) return false;

  // profile_views: no upstream — always a genuine zero
  if (key === 'profile_views') return v === 0;

  // downstream metrics: only mark empty if their upstream is also zero
  // (prevents "No unique visitors yet" when profile_views > 0 but unique = 0)
  const views = metrics.profile_views ?? 0;
  const unique = metrics.unique_users ?? 0;

  if (key === 'unique_users') return views === 0;
  if (key === 'subscribers') return unique === 0;
  if (key === 'capture_rate') return unique === 0;
  if (key === 'listen_clicks') return views === 0;
  if (key === 'total_clicks') return views === 0;
  if (key === 'identified_users') return unique === 0;
  if (key === 'tip_link_visits') return views === 0;

  return false;
}

/** Empty-state label for each metric (shown in place of the number). */
export const METRIC_EMPTY_LABELS: Record<DashboardMetricKey, string> = {
  profile_views: 'No views yet',
  unique_users: 'No visitors yet',
  subscribers: 'No followers yet',
  capture_rate: '—',
  listen_clicks: 'No listen clicks yet',
  identified_users: 'No identified users yet',
  total_clicks: 'No clicks yet',
  tip_link_visits: 'No tip visits yet',
};
