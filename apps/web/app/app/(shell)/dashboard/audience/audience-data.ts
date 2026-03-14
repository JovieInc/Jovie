import {
  and,
  asc,
  desc,
  sql as drizzleSql,
  eq,
  gt,
  gte,
  ne,
  type SQL,
} from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import {
  buildCursorCondition,
  decodeCursor,
  encodeCursor,
} from '@/lib/db/queries/audience-cursor';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tipAudience } from '@/lib/db/schema/tip-audience';
import { formatCountryLabel } from '@/lib/utils/audience';
import { toISOStringOrNull } from '@/lib/utils/date';
import { safeDecodeURIComponent } from '@/lib/utils/string-utils';
import type {
  AudienceAction,
  AudienceIntentLevel,
  AudienceMember,
  AudienceMemberType,
  AudienceReferrer,
  AudienceUtmParams,
} from '@/types';

export type AudienceMode = 'members' | 'subscribers';

export type AudienceView = 'all' | 'identified' | 'anonymous';

export type AudienceServerRow = AudienceMember;

export interface AudienceServerData {
  mode: AudienceMode;
  view: AudienceView;
  rows: AudienceServerRow[];
  /** Null — exact COUNT queries are skipped per JOV-1262/JOV-1264. Use hasMore/nextCursor for pagination. */
  total: number | null;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  /** Opaque cursor token for the next page; null when no further pages. */
  nextCursor: string | null;
  /** True when more rows exist beyond the current page. */
  hasMore: boolean;
  /** Null — exact COUNT queries are skipped per JOV-1262 to avoid per-page DB overhead. */
  subscriberCount: number | null;
  /** Null — exact COUNT queries are skipped per JOV-1262 to avoid per-page DB overhead. */
  totalAudienceCount: number | null;
}

/**
 * Database session transaction type from withDbSessionTx
 */
export type DbSessionTx = Parameters<Parameters<typeof withDbSessionTx>[0]>[0];

const DEFAULT_MEMBER_SORT = 'lastSeen' as const;
const DEFAULT_SUBSCRIBER_SORT = 'createdAt' as const;

const memberQuerySchema = z.object({
  /** Opaque keyset cursor for next-page fetch. When present, page is ignored (JOV-1254). */
  cursor: z.string().optional(),
  /** @deprecated Use cursor instead. */
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
  sort: z
    .enum(['lastSeen', 'visits', 'intent', 'type', 'engagement', 'createdAt'])
    .default(DEFAULT_MEMBER_SORT),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

const subscriberQuerySchema = z.object({
  /** Opaque keyset cursor for next-page fetch. When present, page is ignored (JOV-1261). */
  cursor: z.string().optional(),
  /** @deprecated Use cursor instead. */
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
  sort: z.enum(['email', 'phone', 'country', 'createdAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

const MEMBER_SORT_COLUMNS = {
  lastSeen: audienceMembers.lastSeenAt,
  visits: audienceMembers.visits,
  intent: audienceMembers.intentLevel,
  type: audienceMembers.type,
  engagement: audienceMembers.engagementScore,
  createdAt: audienceMembers.firstSeenAt,
} as const;

/**
 * Build ownership filter based on clerk user ID
 */
function buildOwnershipFilter(clerkUserId: string | null) {
  return clerkUserId
    ? eq(users.clerkId, clerkUserId)
    : drizzleSql<boolean>`true`;
}

/**
 * Build member ID filter (optional)
 */
function buildMemberIdFilter(memberId: string | undefined) {
  return memberId
    ? eq(audienceMembers.id, memberId)
    : drizzleSql<boolean>`true`;
}

/**
 * Transform raw database row to AudienceServerRow
 */
function transformMemberRow(member: {
  id: string;
  type: AudienceMemberType;
  displayName: string | null;
  visits: number;
  engagementScore: number;
  intentLevel: AudienceIntentLevel;
  geoCity: string | null;
  geoCountry: string | null;
  deviceType: string | null;
  latestActions: unknown[] | Record<string, unknown>[] | null;
  referrerHistory: unknown[] | Record<string, unknown>[] | null;
  utmParams: AudienceUtmParams | null;
  email: string | null;
  phone: string | null;
  spotifyConnected: boolean | null;
  purchaseCount: number;
  tipAmountTotalCents: number | null;
  tipCount: number | null;
  ltvStreamingClicks: number | null;
  ltvTipClickValueCents: number | null;
  ltvMerchSalesCents: number | null;
  ltvTicketSalesCents: number | null;
  tags: string[] | null;
  lastSeenAt: Date;
}): AudienceServerRow {
  return {
    id: member.id,
    type: member.type,
    displayName: member.displayName ?? null,
    locationLabel: normalizeLocationLabel(member.geoCity, member.geoCountry),
    geoCity: member.geoCity,
    geoCountry: member.geoCountry,
    visits: member.visits,
    engagementScore: member.engagementScore,
    intentLevel: member.intentLevel,
    latestActions: normalizeLatestActions(member.latestActions),
    referrerHistory: normalizeReferrerHistory(member.referrerHistory),
    utmParams: normalizeUtmParams(member.utmParams),
    email: member.email,
    phone: member.phone,
    spotifyConnected: Boolean(member.spotifyConnected),
    purchaseCount: member.purchaseCount,
    tipAmountTotalCents: member.tipAmountTotalCents ?? 0,
    tipCount: member.tipCount ?? 0,
    ltvStreamingClicks: member.ltvStreamingClicks ?? 0,
    ltvTipClickValueCents: member.ltvTipClickValueCents ?? 0,
    ltvMerchSalesCents: member.ltvMerchSalesCents ?? 0,
    ltvTicketSalesCents: member.ltvTicketSalesCents ?? 0,
    tags: Array.isArray(member.tags) ? member.tags : [],
    deviceType: member.deviceType,
    lastSeenAt: toISOStringOrNull(member.lastSeenAt),
  };
}

function normalizeLocationLabel(
  geoCity: string | null,
  geoCountry: string | null
) {
  // Decode URL-encoded location parts (e.g., %20 -> space, + -> space)
  const parts = [geoCity, geoCountry]
    .filter(Boolean)
    .map(part => safeDecodeURIComponent(part as string));
  return parts.length ? parts.join(', ') : 'Unknown';
}

function isAudienceAction(value: unknown): value is AudienceAction {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.label === 'string' && record.label.length > 0;
}

function normalizeLatestActions(value: unknown): AudienceAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAudienceAction).map(action => ({
    label: action.label,
    emoji: typeof action.emoji === 'string' ? action.emoji : undefined,
    platform: typeof action.platform === 'string' ? action.platform : undefined,
    timestamp:
      typeof action.timestamp === 'string' ? action.timestamp : undefined,
  }));
}

function isAudienceReferrer(value: unknown): value is AudienceReferrer {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.url === 'string' && record.url.length > 0;
}

function normalizeReferrerHistory(value: unknown): AudienceReferrer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAudienceReferrer).map(referrer => ({
    url: referrer.url,
    timestamp:
      typeof referrer.timestamp === 'string' ? referrer.timestamp : undefined,
  }));
}

function normalizeUtmParams(value: unknown): AudienceUtmParams {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: AudienceUtmParams = {};
  if (typeof record.source === 'string') result.source = record.source;
  if (typeof record.medium === 'string') result.medium = record.medium;
  if (typeof record.campaign === 'string') result.campaign = record.campaign;
  if (typeof record.content === 'string') result.content = record.content;
  if (typeof record.term === 'string') result.term = record.term;
  return result;
}

/** Default member query params when validation fails */
const DEFAULT_MEMBER_PARAMS = {
  cursor: undefined,
  page: 1,
  pageSize: 10,
  sort: DEFAULT_MEMBER_SORT,
  direction: 'desc' as const,
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Parse and validate member query parameters
 */
function parseMemberQueryParams(searchParams: SearchParams) {
  const parsed = memberQuerySchema.safeParse({
    cursor: searchParams.cursor,
    page: searchParams.page,
    pageSize: searchParams.pageSize,
    sort: searchParams.sort ?? undefined,
    direction: searchParams.direction ?? undefined,
  });
  return parsed.success ? parsed.data : DEFAULT_MEMBER_PARAMS;
}

/**
 * Build select fields for member query
 */
function buildMemberSelectFields(includeDetails: boolean) {
  return {
    id: audienceMembers.id,
    type: audienceMembers.type,
    displayName: audienceMembers.displayName,
    visits: audienceMembers.visits,
    engagementScore: audienceMembers.engagementScore,
    intentLevel: audienceMembers.intentLevel,
    geoCity: audienceMembers.geoCity,
    geoCountry: audienceMembers.geoCountry,
    deviceType: audienceMembers.deviceType,
    latestActions: includeDetails
      ? audienceMembers.latestActions
      : drizzleSql<unknown[]>`ARRAY[]::jsonb[]`,
    referrerHistory: includeDetails
      ? audienceMembers.referrerHistory
      : drizzleSql<unknown[]>`ARRAY[]::jsonb[]`,
    utmParams: audienceMembers.utmParams,
    email: audienceMembers.email,
    phone: audienceMembers.phone,
    spotifyConnected: audienceMembers.spotifyConnected,
    purchaseCount: audienceMembers.purchaseCount,
    tipAmountTotalCents:
      drizzleSql<number>`COALESCE(${tipAudience.tipAmountTotalCents}, 0)`.as(
        'tip_amount_total_cents'
      ),
    tipCount: drizzleSql<number>`COALESCE(${tipAudience.tipCount}, 0)`.as(
      'tip_count'
    ),
    ltvStreamingClicks: drizzleSql<number>`(
      SELECT COALESCE(COUNT(*), 0)
      FROM ${clickEvents}
      WHERE ${clickEvents.audienceMemberId} = ${audienceMembers.id}
        AND ${clickEvents.linkType} = 'listen'
        AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
    )`.as('ltv_streaming_clicks'),
    ltvTipClickValueCents: drizzleSql<number>`(
      SELECT COALESCE(
        SUM(
          CASE
            WHEN ${clickEvents.linkType} = 'tip' AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
              THEN COALESCE((NULLIF(${clickEvents.metadata} ->> 'tipAmountCents', '')::integer), 500)
            ELSE 0
          END
        ),
        0
      )
      FROM ${clickEvents}
      WHERE ${clickEvents.audienceMemberId} = ${audienceMembers.id}
    )`.as('ltv_tip_click_value_cents'),
    ltvMerchSalesCents: drizzleSql<number>`0`.as('ltv_merch_sales_cents'),
    ltvTicketSalesCents: drizzleSql<number>`0`.as('ltv_ticket_sales_cents'),
    tags: audienceMembers.tags,
    lastSeenAt: audienceMembers.lastSeenAt,
  };
}

/**
 * Map a single segment filter ID to its drizzle condition.
 */
function segmentToCondition(segment: string) {
  switch (segment) {
    case 'highIntent':
      return eq(audienceMembers.intentLevel, 'high');
    case 'returning':
      return gt(audienceMembers.visits, 1);
    case 'frequent':
      return gte(audienceMembers.visits, 3);
    case 'recent24h':
      return gt(
        audienceMembers.lastSeenAt,
        drizzleSql`NOW() - INTERVAL '24 hours'`
      );
    default:
      return null;
  }
}

/**
 * Build segment filter condition based on multiple segment filters.
 * When multiple segments are selected, they are combined with AND logic.
 */
function buildSegmentFilter(segments: string[] | undefined) {
  if (!segments || segments.length === 0) return drizzleSql<boolean>`true`;

  const conditions = segments
    .map(segmentToCondition)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (conditions.length === 0) return drizzleSql<boolean>`true`;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions)!;
}

/**
 * Fetch audience members data
 */
async function fetchMembersData(
  tx: DbSessionTx,
  clerkUserId: string | null,
  selectedProfileId: string,
  searchParams: SearchParams,
  options: {
    includeDetails: boolean;
    memberId: string | undefined;
    viewFilter: AudienceView;
    segmentFilter?: string[];
  }
): Promise<
  Omit<AudienceServerData, 'view' | 'subscriberCount' | 'totalAudienceCount'>
> {
  const { includeDetails, memberId, viewFilter, segmentFilter } = options;
  const safe = parseMemberQueryParams(searchParams);
  const sortColumn = MEMBER_SORT_COLUMNS[safe.sort];
  const orderFn = safe.direction === 'asc' ? asc : desc;

  const ownershipFilter = buildOwnershipFilter(clerkUserId);
  const memberIdFilter = buildMemberIdFilter(memberId);
  let typeCondition: SQL<boolean>;
  if (viewFilter === 'anonymous') {
    typeCondition = eq(audienceMembers.type, 'anonymous') as SQL<boolean>;
  } else if (viewFilter === 'identified') {
    typeCondition = ne(audienceMembers.type, 'anonymous') as SQL<boolean>;
  } else {
    typeCondition = drizzleSql<boolean>`true`;
  }
  const segmentCondition = buildSegmentFilter(segmentFilter);

  // Keyset cursor WHERE clause — avoids full-table OFFSET scan (JOV-1254).
  let cursorCondition: SQL<unknown> = drizzleSql`true`;
  if (safe.cursor) {
    const decoded = decodeCursor(safe.cursor);
    if (decoded) {
      const { v: cursorSortVal, id: cursorId } = decoded;
      cursorCondition = buildCursorCondition(
        safe.direction,
        sortColumn,
        audienceMembers.id,
        cursorSortVal,
        cursorId
      );
    }
  }

  const whereClause = and(
    ownershipFilter,
    eq(audienceMembers.creatorProfileId, selectedProfileId),
    memberIdFilter,
    typeCondition,
    segmentCondition,
    cursorCondition
  );

  const baseQuery = tx
    .select(buildMemberSelectFields(includeDetails))
    .from(audienceMembers)
    .innerJoin(
      creatorProfiles,
      eq(audienceMembers.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .leftJoin(
      tipAudience,
      and(
        eq(tipAudience.profileId, audienceMembers.creatorProfileId),
        eq(tipAudience.email, audienceMembers.email)
      )
    )
    .where(whereClause);

  // Fetch pageSize+1 to detect hasMore without COUNT(*) (JOV-1260).
  const rawRows = await baseQuery
    .orderBy(orderFn(sortColumn), orderFn(audienceMembers.id))
    .limit(safe.pageSize + 1);

  const hasMore = rawRows.length > safe.pageSize;
  const rows = hasMore ? rawRows.slice(0, safe.pageSize) : rawRows;

  // Build next-page cursor from the last returned row.
  let nextCursor: string | null = null;
  if (hasMore && rows.length > 0) {
    const lastRow = rows.at(-1)!;
    const rawSortVal = lastRow.lastSeenAt;
    const sortValStr =
      rawSortVal instanceof Date
        ? rawSortVal.toISOString()
        : String(rawSortVal ?? '');
    nextCursor = encodeCursor(sortValStr, lastRow.id);
  }

  return {
    mode: 'members',
    rows: rows.map(transformMemberRow),
    total: null,
    page: safe.page,
    pageSize: safe.pageSize,
    sort: safe.sort,
    direction: safe.direction,
    nextCursor,
    hasMore,
  };
}

/**
 * Fetch subscribers data
 */
async function _fetchSubscribersData(
  tx: DbSessionTx,
  clerkUserId: string | null,
  selectedProfileId: string,
  searchParams: SearchParams
): Promise<
  Omit<AudienceServerData, 'view' | 'subscriberCount' | 'totalAudienceCount'>
> {
  const parsed = subscriberQuerySchema.safeParse({
    cursor: searchParams.cursor,
    page: searchParams.page,
    pageSize: searchParams.pageSize,
    sort: searchParams.sort ?? undefined,
    direction: searchParams.direction ?? undefined,
  });

  const safe = parsed.success
    ? parsed.data
    : {
        cursor: undefined,
        page: 1,
        pageSize: 10,
        sort: DEFAULT_SUBSCRIBER_SORT,
        direction: 'desc' as const,
      };
  const SUBSCRIBER_SORT_COLUMN_SQL = {
    email: 'ns.email',
    phone: 'ns.phone',
    country: 'ns.country_code',
    createdAt: 'ns.created_at',
  } as const;

  const sortColSql =
    SUBSCRIBER_SORT_COLUMN_SQL[
      safe.sort as keyof typeof SUBSCRIBER_SORT_COLUMN_SQL
    ] ?? 'ns.created_at';
  const dir = safe.direction === 'asc' ? drizzleSql`ASC` : drizzleSql`DESC`;

  // Ownership JOIN condition: when clerkUserId is available, verify the profile
  // belongs to the authenticated user via the users → creatorProfiles chain.
  const ownershipJoinFetch = clerkUserId
    ? drizzleSql`AND u.clerk_id = ${clerkUserId}`
    : drizzleSql``;

  // Keyset cursor clause for subscribers (JOV-1261).
  // Subscribers sort by (created_at, id) composite key for stable ordering.
  let cursorClause = drizzleSql``;
  if (safe.cursor) {
    const decoded = decodeCursor(safe.cursor);
    if (decoded) {
      const cursorCreatedAt = decoded.v;
      const cursorId = decoded.id;
      if (safe.direction === 'desc') {
        cursorClause = drizzleSql`
          AND (ns.created_at < ${cursorCreatedAt}::timestamptz
               OR (ns.created_at = ${cursorCreatedAt}::timestamptz AND ns.id < ${cursorId}))
        `;
      } else {
        cursorClause = drizzleSql`
          AND (ns.created_at > ${cursorCreatedAt}::timestamptz
               OR (ns.created_at = ${cursorCreatedAt}::timestamptz AND ns.id > ${cursorId}))
        `;
      }
    }
  }

  // Fetch pageSize+1 to detect hasMore without COUNT(*) (JOV-1261).
  const fetchLimit = safe.pageSize + 1;

  // Deduplicate by contact: keep the most recent subscription per unique
  // phone/email using DISTINCT ON. The inner query must ORDER BY the distinct
  // key first; the outer query then applies the user-requested sort + pagination.
  const rowsResult = await tx.execute(drizzleSql`
    SELECT ns.id, ns.email, ns.phone,
           ns.country_code AS "countryCode",
           ns.created_at  AS "createdAt",
           ns.channel
    FROM (
      SELECT DISTINCT ON (COALESCE(ns_inner.phone, ns_inner.email))
        ns_inner.id,
        ns_inner.email,
        ns_inner.phone,
        ns_inner.country_code,
        ns_inner.created_at,
        ns_inner.channel
      FROM notification_subscriptions ns_inner
      INNER JOIN creator_profiles cp ON ns_inner.creator_profile_id = cp.id
      INNER JOIN users u             ON cp.user_id = u.id
      WHERE ns_inner.creator_profile_id = ${selectedProfileId}
      ${ownershipJoinFetch}
      ORDER BY COALESCE(ns_inner.phone, ns_inner.email), ns_inner.created_at DESC
    ) ns
    WHERE true ${cursorClause}
    ORDER BY ${drizzleSql.raw(sortColSql)} ${dir}, ns.id ${dir}
    LIMIT ${fetchLimit}
  `);

  const allRows = rowsResult.rows as Array<{
    id: string;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
    createdAt: Date | string;
    channel: string;
  }>;

  const hasMore = allRows.length > safe.pageSize;
  const rows = hasMore ? allRows.slice(0, safe.pageSize) : allRows;

  // Build next-page cursor from the last returned row.
  let nextCursor: string | null = null;
  if (hasMore && rows.length > 0) {
    const lastRow = rows.at(-1)!;
    const sortValStr = toISOStringOrNull(lastRow.createdAt) ?? '';
    nextCursor = encodeCursor(sortValStr, lastRow.id);
  }

  const normalizedRows: AudienceServerRow[] = rows.map(subscriber => {
    const country = subscriber.countryCode;
    const locationLabel = country ? formatCountryLabel(country) : 'Unknown';
    const createdAt = toISOStringOrNull(subscriber.createdAt);
    const type = subscriber.channel === 'email' ? 'email' : 'sms';
    const displayName =
      type === 'email' ? 'Email Subscriber' : 'SMS Subscriber';

    return {
      id: subscriber.id,
      type,
      displayName,
      locationLabel,
      geoCity: null,
      geoCountry: country,
      visits: 1,
      engagementScore: 1,
      intentLevel: 'medium',
      latestActions: [],
      referrerHistory: [],
      utmParams: {},
      email: subscriber.email,
      phone: subscriber.phone,
      spotifyConnected: false,
      purchaseCount: 0,
      tipAmountTotalCents: 0,
      tipCount: 0,
      ltvStreamingClicks: 0,
      ltvTipClickValueCents: 0,
      ltvMerchSalesCents: 0,
      ltvTicketSalesCents: 0,
      tags: [],
      deviceType: null,
      lastSeenAt: createdAt,
    };
  });

  return {
    mode: 'subscribers',
    rows: normalizedRows,
    total: null,
    page: safe.page,
    pageSize: safe.pageSize,
    sort: safe.sort,
    direction: safe.direction,
    nextCursor,
    hasMore,
  };
}

function buildEmptyAudienceData(
  mode: AudienceMode,
  view: AudienceView
): AudienceServerData {
  return {
    mode,
    view,
    rows: [],
    total: null,
    page: 1,
    pageSize: 10,
    sort: DEFAULT_MEMBER_SORT,
    direction: 'desc',
    nextCursor: null,
    hasMore: false,
    subscriberCount: null,
    totalAudienceCount: null,
  };
}

function buildDataPromise(
  tx: DbSessionTx,
  clerkUserId: string,
  selectedProfileId: string,
  view: AudienceView,
  searchParams: SearchParams,
  options: { includeDetails: boolean; memberId?: string; segments?: string[] }
) {
  return fetchMembersData(tx, clerkUserId, selectedProfileId, searchParams, {
    includeDetails: options.includeDetails,
    memberId: options.memberId,
    viewFilter: view,
    segmentFilter: options.segments,
  });
}

export async function getAudienceServerData(params: {
  userId: string;
  selectedProfileId: string | null;
  searchParams: SearchParams;
  includeDetails?: boolean;
  memberId?: string;
  view?: AudienceView;
  segments?: string[];
}): Promise<AudienceServerData> {
  noStore();

  const {
    userId: _userId,
    selectedProfileId,
    searchParams,
    includeDetails = false,
    memberId,
    view = 'all',
    segments,
  } = params;

  // Map view to internal mode
  const mode: AudienceMode = 'members';

  if (!selectedProfileId) {
    return buildEmptyAudienceData(mode, view);
  }

  // All audience reads now go through authenticated RLS-protected sessions
  // RLS bypass capability has been removed for security hardening
  return await withDbSessionTx(async (tx, clerkUserId) => {
    const data = await buildDataPromise(
      tx,
      clerkUserId,
      selectedProfileId,
      view,
      searchParams,
      { includeDetails, memberId, segments }
    );

    // Exact subscriber/audience counts are omitted per JOV-1262 —
    // running COUNT(*) on every page load adds avoidable DB overhead.
    // Clients use hasMore/nextCursor for pagination state instead.
    return {
      ...data,
      view,
      subscriberCount: null,
      totalAudienceCount: null,
    };
  });
}

export function getAudienceUrlSearchParams(searchParams: SearchParams) {
  const getOne = (key: string): string | undefined => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  return {
    sort: getOne('sort'),
    direction: getOne('direction'),
    page: getOne('page'),
    pageSize: getOne('pageSize'),
  };
}
