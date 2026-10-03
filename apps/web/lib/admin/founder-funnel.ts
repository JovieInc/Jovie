import 'server-only';

import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';

export type FounderFunnelTimeRange = '7d' | '30d' | 'all';

/**
 * Versioned metric definition for the founder conversion funnel (JOV-7484).
 * Bump when stage populations, identity rules, or windows change.
 */
export const FOUNDER_FUNNEL_DEFINITION_VERSION = 'founder-funnel.v2';

export interface FounderFunnelStage {
  /** Machine-readable stage key */
  key: string;
  /** Human-readable stage label */
  label: string;
  /** Short description of what the stage counts */
  description: string;
  /** Absolute count for this stage */
  count: number;
  /** Conversion rate from previous stage (0-1), null for first stage */
  conversionRate: number | null;
  /** Number lost between the previous stage and this one (null for first stage) */
  dropOff: number | null;
  /**
   * Whether the aggregate can be enumerated as individual records.
   * Anonymous top-of-funnel traffic is aggregate-only; Ovie never invents
   * per-person attribution for it.
   */
  identifiable: boolean;
  /**
   * Drill-down URL listing exactly the counted records under the same
   * filters, window, and exclusions. Null for anonymous aggregate-only stages.
   */
  drillDownHref: string | null;
}

export interface FounderFunnelData {
  stages: FounderFunnelStage[];
  timeRange: FounderFunnelTimeRange;
  /**
   * Stage key with the largest absolute drop-off from its previous stage —
   * the biggest leak in the funnel. Null when the funnel is empty.
   */
  biggestDropOffKey: string | null;
  errors: string[];
  /** Versioned metric definition backing these numbers. */
  definitionVersion: string;
}

/**
 * Stages whose aggregate resolves to enumerable user rows. The anonymous
 * `onboarding_chats` stage is deliberately excluded — it has no person-level
 * identity and must not drill into records.
 */
export const FOUNDER_FUNNEL_DRILLDOWN_STAGES = [
  'accounts_created',
  'profile_claimed',
  'onboarding_complete',
  'paid',
] as const;

export type FounderFunnelDrilldownStage =
  (typeof FOUNDER_FUNNEL_DRILLDOWN_STAGES)[number];

export function isFounderFunnelDrilldownStage(
  value: unknown
): value is FounderFunnelDrilldownStage {
  return (
    typeof value === 'string' &&
    (FOUNDER_FUNNEL_DRILLDOWN_STAGES as readonly string[]).includes(value)
  );
}

export function isFounderFunnelTimeRange(
  value: unknown
): value is FounderFunnelTimeRange {
  return value === '7d' || value === '30d' || value === 'all';
}

interface StageDef {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly identifiable: boolean;
}

const STAGE_DEFS: readonly StageDef[] = [
  {
    key: 'onboarding_chats',
    label: 'Onboarding chats',
    description:
      'Anonymous onboarding conversations (aggregate only — no per-person identity)',
    identifiable: false,
  },
  {
    key: 'accounts_created',
    label: 'Accounts created',
    description: 'Signups (users created), excluding internal/test accounts',
    identifiable: true,
  },
  {
    key: 'profile_claimed',
    label: 'Profile claimed',
    description: 'Users with a claimed creator profile',
    identifiable: true,
  },
  {
    key: 'onboarding_complete',
    label: 'Onboarding complete',
    description: 'Users whose profile finished onboarding',
    identifiable: true,
  },
  {
    key: 'paid',
    label: 'Paid',
    description:
      'Users with an active Stripe subscription, excluding internal/test accounts',
    identifiable: true,
  },
];

function toDateFilter(timeRange: FounderFunnelTimeRange): Date | null {
  if (timeRange === 'all') return null;
  const now = new Date();
  const days = timeRange === '7d' ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now;
}

/**
 * Drill-down URL encoding the cohort window in the query string, so a deep
 * link reproduces the same population the aggregate counted.
 */
function stageDrillDownHref(
  stage: StageDef,
  timeRange: FounderFunnelTimeRange
): string | null {
  if (!stage.identifiable) return null;
  return buildAdminGrowthHref(
    'leads',
    new URLSearchParams({
      funnelStage: stage.key,
      funnelRange: timeRange,
    })
  );
}

function buildStages(
  counts: readonly number[],
  timeRange: FounderFunnelTimeRange
): FounderFunnelStage[] {
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i] ?? 0;
    const drillDownHref = stageDrillDownHref(def, timeRange);
    if (i === 0) {
      return {
        ...def,
        count,
        conversionRate: null,
        dropOff: null,
        drillDownHref,
      };
    }
    const prev = counts[i - 1] ?? 0;
    return {
      ...def,
      count,
      conversionRate: prev > 0 ? count / prev : null,
      dropOff: prev > 0 ? prev - count : null,
      drillDownHref,
    };
  });
}

function findBiggestDropOff(stages: FounderFunnelStage[]): string | null {
  let biggestKey: string | null = null;
  let biggest = 0;
  for (const stage of stages) {
    if (stage.dropOff !== null && stage.dropOff > biggest) {
      biggest = stage.dropOff;
      biggestKey = stage.key;
    }
  }
  return biggestKey;
}

/**
 * Internal/test/dogfood exclusion consumed from the shared classifier
 * (lib/utils/email, owned by JOV-7362/JOV-7395). Applied to every user-based
 * stage so seeded QA and team accounts never read as customers.
 */
const EXTERNAL_USER_CONSTRAINT = drizzleSql`
  (u.email IS NULL OR u.email !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN})
`;

function userDateConstraint(dateFilter: Date | null): SQL {
  return dateFilter
    ? drizzleSql`AND u.created_at >= ${dateFilter.toISOString()}`
    : drizzleSql``;
}

/**
 * Membership predicate for one user-based stage, expressed over the shared
 * `base_users` cohort (aliased `bu`). The aggregate funnel and the drill-down
 * listing both use these fragments, so a stage count can never diverge from
 * the records behind it.
 */
function stageMembershipConstraint(stage: FounderFunnelDrilldownStage): SQL {
  switch (stage) {
    case 'accounts_created':
      return drizzleSql``;
    case 'profile_claimed':
      return drizzleSql`AND EXISTS (
        SELECT 1 FROM creator_profiles cp
        WHERE cp.user_id = bu.id AND cp.is_claimed = true
      )`;
    case 'onboarding_complete':
      return drizzleSql`AND EXISTS (
        SELECT 1 FROM creator_profiles cp
        WHERE cp.user_id = bu.id AND cp.onboarding_completed_at IS NOT NULL
      )`;
    case 'paid':
      return drizzleSql`AND bu.stripe_subscription_id IS NOT NULL`;
  }
}

/**
 * Queries the database for the founder conversion funnel (#11500):
 * onboarding chat → account created → profile claimed → onboarding
 * complete → paid.
 *
 * Stage sources (all first-party, reconciled with existing admin metrics):
 * 1. Onboarding chats — anonymous onboarding conversations
 *    (chat_conversations with a session_id), the top-of-funnel proxy for
 *    landing visitors engaging. Marketing-site raw pageviews have no
 *    first-party store yet, so the funnel starts at the first tracked touch.
 *    Aggregate-only: no per-person identity exists for these rows.
 * 2. Accounts created — rows in users (excluding soft-deleted and
 *    internal/test accounts via the shared JOV-7362 classifier).
 * 3. Profile claimed — users with a claimed creator_profile
 *    (same definition as lib/admin/conversion-funnel.ts "With Profiles").
 * 4. Onboarding complete — users with creator_profiles.onboarding_completed_at.
 * 5. Paid — users with a Stripe subscription id (same definition as the
 *    existing conversion funnel's "Paid" stage).
 *
 * Window semantics: `7d`/`30d` filter the cohort by when the person entered
 * the top of their observable journey (chat started / user created);
 * downstream stages then measure how far that cohort progressed.
 *
 * Uses a single SQL query with CTEs for efficiency.
 */
export async function getFounderFunnelData(
  timeRange: FounderFunnelTimeRange = '30d'
): Promise<FounderFunnelData> {
  const errors: string[] = [];
  const dateFilter = toDateFilter(timeRange);

  try {
    type FunnelRow = {
      onboarding_chats: string | number;
      accounts_created: string | number;
      profile_claimed: string | number;
      onboarding_complete: string | number;
      paid_users: string | number;
    };

    const convoDateConstraint = dateFilter
      ? drizzleSql`AND cc.created_at >= ${dateFilter.toISOString()}`
      : drizzleSql``;

    const result = await db.execute<FunnelRow>(
      drizzleSql`
        WITH onboarding_chats AS (
          SELECT count(*) AS n
          FROM chat_conversations cc
          WHERE cc.session_id IS NOT NULL
          ${convoDateConstraint}
        ),
        base_users AS (
          SELECT u.id, u.stripe_subscription_id
          FROM users u
          WHERE u.deleted_at IS NULL
          AND ${EXTERNAL_USER_CONSTRAINT}
          ${userDateConstraint(dateFilter)}
        )
        SELECT
          (SELECT n FROM onboarding_chats) AS onboarding_chats,
          (SELECT count(*) FROM base_users bu WHERE true ${stageMembershipConstraint('accounts_created')}) AS accounts_created,
          (SELECT count(*) FROM base_users bu WHERE true ${stageMembershipConstraint('profile_claimed')}) AS profile_claimed,
          (SELECT count(*) FROM base_users bu WHERE true ${stageMembershipConstraint('onboarding_complete')}) AS onboarding_complete,
          (SELECT count(*) FROM base_users bu WHERE true ${stageMembershipConstraint('paid')}) AS paid_users
        ;
      `
    );

    const row = result.rows?.[0];
    const counts = [
      Number(row?.onboarding_chats ?? 0),
      Number(row?.accounts_created ?? 0),
      Number(row?.profile_claimed ?? 0),
      Number(row?.onboarding_complete ?? 0),
      Number(row?.paid_users ?? 0),
    ];

    const stages = buildStages(counts, timeRange);

    return {
      stages,
      timeRange,
      biggestDropOffKey: findBiggestDropOff(stages),
      errors,
      definitionVersion: FOUNDER_FUNNEL_DEFINITION_VERSION,
    };
  } catch (error) {
    captureError('Error fetching founder funnel data', error);
    errors.push(
      `Founder funnel query: ${error instanceof Error ? error.message : 'unknown'}`
    );

    return {
      stages: buildStages([0, 0, 0, 0, 0], timeRange),
      timeRange,
      biggestDropOffKey: null,
      errors,
      definitionVersion: FOUNDER_FUNNEL_DEFINITION_VERSION,
    };
  }
}

export interface FounderFunnelStageRow {
  readonly id: string;
  readonly displayName: string | null;
  readonly email: string | null;
  /** ISO timestamp the person entered the funnel cohort (account created). */
  readonly enteredAt: string | null;
}

export interface FounderFunnelStageRows {
  readonly stage: FounderFunnelDrilldownStage;
  readonly stageLabel: string;
  readonly stageDescription: string;
  readonly timeRange: FounderFunnelTimeRange;
  /** Total records in the stage population under the same filters. */
  readonly total: number;
  readonly rows: FounderFunnelStageRow[];
  readonly limit: number;
  readonly errors: string[];
  readonly definitionVersion: string;
}

export const FOUNDER_FUNNEL_DRILLDOWN_LIMIT = 100;

/**
 * Lists the exact records behind one identifiable funnel stage, using the
 * same cohort window, identity exclusion, and membership predicate as the
 * aggregate — so the stage count and its drill-down always match (JOV-7484).
 */
export async function getFounderFunnelStageRows(
  stage: FounderFunnelDrilldownStage,
  timeRange: FounderFunnelTimeRange = '30d',
  limit: number = FOUNDER_FUNNEL_DRILLDOWN_LIMIT
): Promise<FounderFunnelStageRows> {
  const def = STAGE_DEFS.find(d => d.key === stage);
  const base: FounderFunnelStageRows = {
    stage,
    stageLabel: def?.label ?? stage,
    stageDescription: def?.description ?? '',
    timeRange,
    total: 0,
    rows: [],
    limit,
    errors: [],
    definitionVersion: FOUNDER_FUNNEL_DEFINITION_VERSION,
  };

  const dateFilter = toDateFilter(timeRange);
  const boundedLimit = Math.min(Math.max(1, limit), 500);

  try {
    type Row = {
      id: string;
      name: string | null;
      email: string | null;
      created_at: Date | string | null;
      total: string | number;
    };

    const result = await db.execute<Row>(
      drizzleSql`
        WITH base_users AS (
          SELECT u.id, u.name, u.email, u.stripe_subscription_id, u.created_at
          FROM users u
          WHERE u.deleted_at IS NULL
          AND ${EXTERNAL_USER_CONSTRAINT}
          ${userDateConstraint(dateFilter)}
        )
        SELECT bu.id, bu.name, bu.email, bu.created_at,
               count(*) OVER () AS total
        FROM base_users bu
        WHERE true ${stageMembershipConstraint(stage)}
        ORDER BY bu.created_at DESC
        LIMIT ${boundedLimit}
        ;
      `
    );

    const rows = result.rows ?? [];
    return {
      ...base,
      total: Number(rows[0]?.total ?? 0),
      rows: rows.map(row => ({
        id: row.id,
        displayName: row.name,
        email: row.email,
        enteredAt:
          row.created_at == null
            ? null
            : new Date(row.created_at).toISOString(),
      })),
    };
  } catch (error) {
    captureError('Error fetching founder funnel stage rows', error, {
      stage,
      timeRange,
    });
    return {
      ...base,
      errors: [
        `Stage drill-down query: ${error instanceof Error ? error.message : 'unknown'}`,
      ],
    };
  }
}
