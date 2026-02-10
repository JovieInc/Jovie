import { and, asc, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import {
  audienceMembers,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { formatCountryLabel } from '@/lib/utils/audience';
import { safeDecodeURIComponent } from '@/lib/utils/string-utils';
import type {
  AudienceAction,
  AudienceIntentLevel,
  AudienceMember,
  AudienceMemberType,
  AudienceReferrer,
} from '@/types';

export type AudienceMode = 'members' | 'subscribers';

export type AudienceView = 'all' | 'subscribers' | 'anonymous';

export type AudienceServerRow = AudienceMember;

export interface AudienceServerData {
  mode: AudienceMode;
  view: AudienceView;
  rows: AudienceServerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  subscriberCount: number;
}

/**
 * Database session transaction type from withDbSessionTx
 */
export type DbSessionTx = Parameters<Parameters<typeof withDbSessionTx>[0]>[0];

const DEFAULT_MEMBER_SORT = 'lastSeen' as const;
const DEFAULT_SUBSCRIBER_SORT = 'createdAt' as const;

const memberQuerySchema = z.object({
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

const SUBSCRIBER_SORT_COLUMNS = {
  email: notificationSubscriptions.email,
  phone: notificationSubscriptions.phone,
  country: notificationSubscriptions.countryCode,
  createdAt: notificationSubscriptions.createdAt,
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
  email: string | null;
  phone: string | null;
  spotifyConnected: boolean | null;
  purchaseCount: number;
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
    email: member.email,
    phone: member.phone,
    spotifyConnected: Boolean(member.spotifyConnected),
    purchaseCount: member.purchaseCount,
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

/**
 * Safely converts a Date object or ISO string to ISO string format.
 * Handles both Date objects (from database) and already-serialized strings (from SSR).
 */
function toISOStringOrNull(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
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

/** Default member query params when validation fails */
const DEFAULT_MEMBER_PARAMS = {
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
    email: audienceMembers.email,
    phone: audienceMembers.phone,
    spotifyConnected: audienceMembers.spotifyConnected,
    purchaseCount: audienceMembers.purchaseCount,
    tags: audienceMembers.tags,
    lastSeenAt: audienceMembers.lastSeenAt,
  };
}

/**
 * Fetch audience members data
 */
async function fetchMembersData(
  tx: DbSessionTx,
  clerkUserId: string | null,
  selectedProfileId: string,
  searchParams: SearchParams,
  includeDetails: boolean,
  memberId: string | undefined,
  typeFilter?: AudienceMemberType
): Promise<Omit<AudienceServerData, 'view' | 'subscriberCount'>> {
  const safe = parseMemberQueryParams(searchParams);
  const sortColumn = MEMBER_SORT_COLUMNS[safe.sort];
  const orderFn = safe.direction === 'asc' ? asc : desc;
  const offset = (safe.page - 1) * safe.pageSize;

  const ownershipFilter = buildOwnershipFilter(clerkUserId);
  const memberIdFilter = buildMemberIdFilter(memberId);
  const typeCondition = typeFilter
    ? eq(audienceMembers.type, typeFilter)
    : drizzleSql<boolean>`true`;
  const whereClause = and(
    ownershipFilter,
    eq(audienceMembers.creatorProfileId, selectedProfileId),
    memberIdFilter,
    typeCondition
  );

  const baseQuery = tx
    .select(buildMemberSelectFields(includeDetails))
    .from(audienceMembers)
    .innerJoin(
      creatorProfiles,
      eq(audienceMembers.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(whereClause);

  const totalQuery = tx
    .select({
      total: drizzleSql`COALESCE(COUNT(${audienceMembers.id}), 0)`,
    })
    .from(audienceMembers)
    .innerJoin(
      creatorProfiles,
      eq(audienceMembers.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(whereClause);

  const [rows, [{ total }]] = await Promise.all([
    baseQuery.orderBy(orderFn(sortColumn)).limit(safe.pageSize).offset(offset),
    totalQuery,
  ]);

  return {
    mode: 'members',
    rows: rows.map(transformMemberRow),
    total: Number(total ?? 0),
    page: safe.page,
    pageSize: safe.pageSize,
    sort: safe.sort,
    direction: safe.direction,
  };
}

/**
 * Fetch subscribers data
 */
async function fetchSubscribersData(
  tx: DbSessionTx,
  clerkUserId: string | null,
  selectedProfileId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<Omit<AudienceServerData, 'view' | 'subscriberCount'>> {
  const parsed = subscriberQuerySchema.safeParse({
    page: searchParams.page,
    pageSize: searchParams.pageSize,
    sort: searchParams.sort ?? undefined,
    direction: searchParams.direction ?? undefined,
  });

  const safe = parsed.success
    ? parsed.data
    : {
        page: 1,
        pageSize: 10,
        sort: DEFAULT_SUBSCRIBER_SORT,
        direction: 'desc' as const,
      };

  const sortColumn = SUBSCRIBER_SORT_COLUMNS[safe.sort];
  const orderFn = safe.direction === 'asc' ? asc : desc;
  const offset = (safe.page - 1) * safe.pageSize;

  const ownershipFilter = clerkUserId
    ? eq(users.clerkId, clerkUserId)
    : drizzleSql<boolean>`true`;

  const baseQuery = tx
    .select({
      id: notificationSubscriptions.id,
      email: notificationSubscriptions.email,
      phone: notificationSubscriptions.phone,
      countryCode: notificationSubscriptions.countryCode,
      createdAt: notificationSubscriptions.createdAt,
      channel: notificationSubscriptions.channel,
    })
    .from(notificationSubscriptions)
    .innerJoin(
      creatorProfiles,
      eq(notificationSubscriptions.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(
      and(
        ownershipFilter,
        eq(notificationSubscriptions.creatorProfileId, selectedProfileId)
      )
    );

  const totalQuery = tx
    .select({
      total: drizzleSql`COALESCE(COUNT(${notificationSubscriptions.id}), 0)`,
    })
    .from(notificationSubscriptions)
    .innerJoin(
      creatorProfiles,
      eq(notificationSubscriptions.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(
      and(
        ownershipFilter,
        eq(notificationSubscriptions.creatorProfileId, selectedProfileId)
      )
    );

  const [rows, [{ total }]] = await Promise.all([
    baseQuery.orderBy(orderFn(sortColumn)).limit(safe.pageSize).offset(offset),
    totalQuery,
  ]);

  const normalizedRows: AudienceServerRow[] = rows.map(subscriber => {
    const country = subscriber.countryCode;
    const locationLabel = country ? formatCountryLabel(country) : 'Unknown';
    const createdAt = toISOStringOrNull(subscriber.createdAt);
    const displayName = subscriber.email || subscriber.phone || 'Contact';
    const type = subscriber.channel === 'email' ? 'email' : 'sms';

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
      email: subscriber.email,
      phone: subscriber.phone,
      spotifyConnected: false,
      purchaseCount: 0,
      tags: [],
      deviceType: null,
      lastSeenAt: createdAt,
    };
  });

  return {
    mode: 'subscribers',
    rows: normalizedRows,
    total: Number(total ?? 0),
    page: safe.page,
    pageSize: safe.pageSize,
    sort: safe.sort,
    direction: safe.direction,
  };
}

/**
 * Count total subscribers for a profile (lightweight query for UI state)
 */
async function countSubscribers(
  tx: DbSessionTx,
  clerkUserId: string | null,
  selectedProfileId: string
): Promise<number> {
  const ownershipFilter = clerkUserId
    ? eq(users.clerkId, clerkUserId)
    : drizzleSql<boolean>`true`;

  const [{ total }] = await tx
    .select({
      total: drizzleSql`COALESCE(COUNT(${notificationSubscriptions.id}), 0)`,
    })
    .from(notificationSubscriptions)
    .innerJoin(
      creatorProfiles,
      eq(notificationSubscriptions.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(
      and(
        ownershipFilter,
        eq(notificationSubscriptions.creatorProfileId, selectedProfileId)
      )
    );

  return Number(total ?? 0);
}

export async function getAudienceServerData(params: {
  userId: string;
  selectedProfileId: string | null;
  searchParams: Record<string, string | string[] | undefined>;
  includeDetails?: boolean;
  memberId?: string;
  view?: AudienceView;
}): Promise<AudienceServerData> {
  noStore();

  const {
    userId: _userId,
    selectedProfileId,
    searchParams,
    includeDetails = false,
    memberId,
    view = 'all',
  } = params;

  // Map view to internal mode
  const mode: AudienceMode = view === 'subscribers' ? 'subscribers' : 'members';

  if (!selectedProfileId) {
    return {
      mode,
      view,
      rows: [],
      total: 0,
      page: 1,
      pageSize: 10,
      sort: mode === 'members' ? DEFAULT_MEMBER_SORT : DEFAULT_SUBSCRIBER_SORT,
      direction: 'desc',
      subscriberCount: 0,
    };
  }

  // All audience reads now go through authenticated RLS-protected sessions
  // RLS bypass capability has been removed for security hardening
  return await withDbSessionTx(async (tx, clerkUserId) => {
    // Always count subscribers for the export button state
    const subscriberCount = await countSubscribers(
      tx,
      clerkUserId,
      selectedProfileId
    );

    let data: Omit<AudienceServerData, 'view' | 'subscriberCount'>;

    if (mode === 'subscribers') {
      data = await fetchSubscribersData(
        tx,
        clerkUserId,
        selectedProfileId,
        searchParams
      );
    } else {
      // 'all' shows all members, 'anonymous' filters to anonymous only
      const typeFilter =
        view === 'anonymous' ? ('anonymous' as AudienceMemberType) : undefined;
      data = await fetchMembersData(
        tx,
        clerkUserId,
        selectedProfileId,
        searchParams,
        includeDetails,
        memberId,
        typeFilter
      );
    }

    return {
      ...data,
      view,
      subscriberCount,
    };
  });
}

export function getAudienceUrlSearchParams(
  searchParams: Record<string, string | string[] | undefined>
) {
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
