import { describe, expect, it } from 'vitest';
import {
  getContradictoryMetrics,
  isMetricEmpty,
  METRIC_DEFINITIONS,
  METRIC_EMPTY_LABELS,
} from '@/lib/analytics/metric-definitions';

// ---------------------------------------------------------------------------
// Canonical definitions coverage
// ---------------------------------------------------------------------------

describe('METRIC_DEFINITIONS', () => {
  it('every metric key has a label and definition', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.label, `${key}.label`).toBeTruthy();
      expect(def.definition, `${key}.definition`).toBeTruthy();
    }
  });

  it('every metric key has a corresponding METRIC_EMPTY_LABELS entry', () => {
    for (const key of Object.keys(METRIC_DEFINITIONS)) {
      expect(
        METRIC_EMPTY_LABELS[key as keyof typeof METRIC_EMPTY_LABELS],
        `empty label for ${key}`
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant / contradiction guards
// ---------------------------------------------------------------------------

describe('getContradictoryMetrics', () => {
  it('returns empty set for fully consistent data', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      unique_users: 80,
      subscribers: 20,
      listen_clicks: 30,
      total_clicks: 50,
      identified_users: 40,
      capture_rate: 25,
    });
    expect(result.size).toBe(0);
  });

  it('flags unique_users when it exceeds profile_views', () => {
    const result = getContradictoryMetrics({
      profile_views: 10,
      unique_users: 20,
    });
    expect(result.has('unique_users')).toBe(true);
  });

  it('flags unique_users when profile_views is 0 but unique_users > 0', () => {
    // The canonical contradiction: 0 views but non-zero visitors
    const result = getContradictoryMetrics({
      profile_views: 0,
      unique_users: 5,
    });
    expect(result.has('unique_users')).toBe(true);
  });

  it('flags subscribers when unique_users is 0 but subscribers > 0', () => {
    const result = getContradictoryMetrics({
      profile_views: 0,
      unique_users: 0,
      subscribers: 3,
    });
    expect(result.has('subscribers')).toBe(true);
  });

  it('flags subscribers when they exceed unique_users', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      unique_users: 10,
      subscribers: 15,
    });
    expect(result.has('subscribers')).toBe(true);
  });

  it('flags listen_clicks when they exceed total_clicks', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      total_clicks: 5,
      listen_clicks: 10,
    });
    expect(result.has('listen_clicks')).toBe(true);
  });

  it('flags listen_clicks when total_clicks is absent but listen_clicks > 0', () => {
    // total_clicks missing from API payload — listen can't be non-zero if total is unknown/0
    const result = getContradictoryMetrics({
      profile_views: 100,
      listen_clicks: 5,
    });
    expect(result.has('listen_clicks')).toBe(true);
  });

  it('flags identified_users when they exceed unique_users', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      unique_users: 10,
      identified_users: 20,
    });
    expect(result.has('identified_users')).toBe(true);
  });

  it('flags identified_users when unique_users is 0 but identified > 0', () => {
    const result = getContradictoryMetrics({
      profile_views: 0,
      unique_users: 0,
      identified_users: 2,
    });
    expect(result.has('identified_users')).toBe(true);
  });

  it('flags capture_rate above 100', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      unique_users: 50,
      subscribers: 30,
      capture_rate: 120,
    });
    expect(result.has('capture_rate')).toBe(true);
  });

  it('flags capture_rate below 0', () => {
    const result = getContradictoryMetrics({
      profile_views: 100,
      unique_users: 50,
      capture_rate: -5,
    });
    expect(result.has('capture_rate')).toBe(true);
  });

  it('does not flag profile_views itself (it is the root)', () => {
    const result = getContradictoryMetrics({
      profile_views: 0,
      unique_users: 0,
      subscribers: 0,
    });
    expect(result.has('profile_views')).toBe(false);
  });

  it('handles undefined metrics gracefully (no crash)', () => {
    expect(() =>
      getContradictoryMetrics({
        profile_views: undefined,
        unique_users: undefined,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Empty-state logic
// ---------------------------------------------------------------------------

describe('isMetricEmpty', () => {
  it('returns true for profile_views when 0', () => {
    expect(isMetricEmpty('profile_views', { profile_views: 0 })).toBe(true);
  });

  it('returns false for profile_views when > 0', () => {
    expect(isMetricEmpty('profile_views', { profile_views: 5 })).toBe(false);
  });

  it('returns true for unique_users=0 when profile_views is also 0', () => {
    expect(
      isMetricEmpty('unique_users', { profile_views: 0, unique_users: 0 })
    ).toBe(true);
  });

  it('returns false for unique_users=0 when profile_views > 0 (contradictory but not empty)', () => {
    // 0 unique visitors despite 10 views is not "empty" — it's suspicious
    expect(
      isMetricEmpty('unique_users', { profile_views: 10, unique_users: 0 })
    ).toBe(false);
  });

  it('returns true for subscribers=0 when unique_users is also 0', () => {
    expect(
      isMetricEmpty('subscribers', { unique_users: 0, subscribers: 0 })
    ).toBe(true);
  });

  it('returns false for subscribers=0 when unique_users > 0 (0% conversion is valid)', () => {
    expect(
      isMetricEmpty('subscribers', { unique_users: 50, subscribers: 0 })
    ).toBe(false);
  });

  it('returns false when value is positive', () => {
    expect(
      isMetricEmpty('listen_clicks', { profile_views: 100, listen_clicks: 3 })
    ).toBe(false);
  });

  it('returns false when value is undefined (not yet loaded)', () => {
    expect(isMetricEmpty('listen_clicks', { profile_views: 0 })).toBe(false);
  });

  it('returns true for capture_rate=0 when unique_users is also 0', () => {
    expect(
      isMetricEmpty('capture_rate', { unique_users: 0, capture_rate: 0 })
    ).toBe(true);
  });

  it('returns false for capture_rate=0 when unique_users > 0 (0% conversion is valid)', () => {
    expect(
      isMetricEmpty('capture_rate', { unique_users: 50, capture_rate: 0 })
    ).toBe(false);
  });

  it('returns true for tip_link_visits=0 when profile_views is also 0', () => {
    expect(
      isMetricEmpty('tip_link_visits', {
        profile_views: 0,
        tip_link_visits: 0,
      })
    ).toBe(true);
  });
});
