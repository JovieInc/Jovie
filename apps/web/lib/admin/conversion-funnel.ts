import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';

export type ConversionFunnelTimeRange = '7d' | '30d' | 'all';

export interface ConversionFunnelStage {
  /** Machine-readable stage key */
  key: string;
  /** Human-readable stage label */
  label: string;
  /** Absolute count for this stage */
  count: number;
  /** Conversion rate from previous stage (0-1), null for first stage */
  conversionRate: number | null;
  /** Number of users who did not progress from the previous stage */
  dropOff: number | null;
}

export interface ConversionFunnelData {
  stages: ConversionFunnelStage[];
  timeRange: ConversionFunnelTimeRange;
  errors: string[];
}

function toDateFilter(timeRange: ConversionFunnelTimeRange): Date | null {
  if (timeRange === 'all') return null;
  const now = new Date();
  const days = timeRange === '7d' ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now;
}

/**
 * Queries the database to reconstruct the signup-to-paid conversion funnel.
 *
 * Funnel stages:
 * 1. Total Users — count of users in the users table
 * 2. With Profiles — users who have a claimed creator_profile
 * 3. Profile Complete — profiles with display_name + avatar_url + username + spotify_url (proxy for "has music")
 * 4. Has Subscribers — profiles with at least 1 notification subscriber
 * 5. Paid — users with an active Stripe subscription
 *
 * Uses a single SQL query with conditional counts for efficiency.
 */
export async function getConversionFunnelData(
  timeRange: ConversionFunnelTimeRange = 'all'
): Promise<ConversionFunnelData> {
  const errors: string[] = [];
  const dateFilter = toDateFilter(timeRange);

  try {
    type FunnelRow = {
      total_users: string | number;
      with_profiles: string | number;
      profile_complete: string | number;
      has_subscribers: string | number;
      paid_users: string | number;
    };

    // Build date constraint SQL fragment
    const dateConstraint = dateFilter
      ? drizzleSql`AND u.created_at >= ${dateFilter.toISOString()}`
      : drizzleSql``;

    const result = await db.execute<FunnelRow>(
      drizzleSql`
        WITH base_users AS (
          SELECT u.id
          FROM users u
          WHERE u.deleted_at IS NULL
          ${dateConstraint}
        ),
        user_profiles AS (
          SELECT DISTINCT cp.user_id, cp.id AS profile_id,
            cp.display_name, cp.avatar_url, cp.username, cp.spotify_url
          FROM creator_profiles cp
          INNER JOIN base_users bu ON bu.id = cp.user_id
          WHERE cp.is_claimed = true
        ),
        complete_profiles AS (
          SELECT up.user_id, up.profile_id
          FROM user_profiles up
          WHERE up.display_name IS NOT NULL
            AND up.avatar_url IS NOT NULL
            AND up.username IS NOT NULL
            AND up.spotify_url IS NOT NULL
        ),
        profiles_with_subs AS (
          SELECT DISTINCT cp.user_id
          FROM complete_profiles cp
          INNER JOIN notification_subscriptions ns ON ns.creator_profile_id = cp.profile_id
          WHERE ns.unsubscribed_at IS NULL
        ),
        paid AS (
          SELECT bu.id
          FROM base_users bu
          INNER JOIN users u ON u.id = bu.id
          WHERE u.stripe_subscription_id IS NOT NULL
        )
        SELECT
          (SELECT count(*) FROM base_users) AS total_users,
          (SELECT count(*) FROM user_profiles) AS with_profiles,
          (SELECT count(*) FROM complete_profiles) AS profile_complete,
          (SELECT count(*) FROM profiles_with_subs) AS has_subscribers,
          (SELECT count(*) FROM paid) AS paid_users
        ;
      `
    );

    const row = result.rows?.[0];
    const totalUsers = Number(row?.total_users ?? 0);
    const withProfiles = Number(row?.with_profiles ?? 0);
    const profileComplete = Number(row?.profile_complete ?? 0);
    const hasSubscribers = Number(row?.has_subscribers ?? 0);
    const paidUsers = Number(row?.paid_users ?? 0);

    const raw = [
      { key: 'total_users', label: 'Total Users', count: totalUsers },
      { key: 'with_profiles', label: 'With Profiles', count: withProfiles },
      {
        key: 'profile_complete',
        label: 'Profile Complete',
        count: profileComplete,
      },
      {
        key: 'has_subscribers',
        label: 'Has Subscribers',
        count: hasSubscribers,
      },
      { key: 'paid', label: 'Paid', count: paidUsers },
    ];

    const stages: ConversionFunnelStage[] = raw.map((stage, i) => {
      if (i === 0) {
        return { ...stage, conversionRate: null, dropOff: null };
      }
      const prev = raw[i - 1];
      const conversionRate = prev.count > 0 ? stage.count / prev.count : null;
      const dropOff = prev.count > 0 ? prev.count - stage.count : null;
      return { ...stage, conversionRate, dropOff };
    });

    return { stages, timeRange, errors };
  } catch (error) {
    captureError('Error fetching conversion funnel data', error);
    errors.push(
      `Funnel query: ${error instanceof Error ? error.message : 'unknown'}`
    );

    // Return empty funnel on error
    const emptyStages: ConversionFunnelStage[] = [
      'Total Users',
      'With Profiles',
      'Profile Complete',
      'Has Subscribers',
      'Paid',
    ].map((label, i) => ({
      key: label.toLowerCase().replaceAll(/\s+/g, '_'),
      label,
      count: 0,
      conversionRate: null,
      dropOff: null,
    }));

    return { stages: emptyStages, timeRange, errors };
  }
}
