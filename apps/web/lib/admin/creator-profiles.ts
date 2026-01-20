import 'server-only';

import { randomUUID } from 'crypto';
import {
  count,
  desc,
  sql as drizzleSql,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import { creatorProfiles, socialLinks } from '@/lib/db/schema';
import { escapeLikePattern } from '@/lib/utils/sql';

// Default claim token expiration: 30 days
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

export interface AdminCreatorProfileRow {
  id: string;
  username: string;
  usernameNormalized: string;
  avatarUrl: string | null;
  displayName?: string | null;
  isVerified: boolean;
  isFeatured: boolean;
  marketingOptOut: boolean;
  isClaimed: boolean;
  claimToken: string | null;
  claimTokenExpiresAt: Date | null;
  userId: string | null;
  createdAt: Date | null;
  confidence?: number | null;
  ingestionStatus: 'idle' | 'pending' | 'processing' | 'failed';
  lastIngestionError: string | null;
  socialLinks?: Array<{
    id: string;
    platform: string;
    platformType: string;
    url: string;
    displayText: string | null;
  }>;
}

export type AdminCreatorProfilesSort =
  | 'created_desc'
  | 'created_asc'
  | 'verified_desc'
  | 'verified_asc'
  | 'claimed_desc'
  | 'claimed_asc';

export interface AdminCreatorProfilesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: AdminCreatorProfilesSort;
}

export interface AdminCreatorProfilesResult {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
}

function sanitizeSearchInput(rawSearch?: string): string | undefined {
  if (!rawSearch) return undefined;

  const trimmed = rawSearch.trim();
  if (trimmed.length === 0) return undefined;

  // Enforce a reasonable max length to avoid pathological inputs
  const limited = trimmed.slice(0, 100);

  // Allow basic handle-like characters and spaces; drop anything else
  const sanitized = limited.replaceAll(/[^a-zA-Z0-9_\-\s]/g, '');

  if (sanitized.length === 0) return undefined;

  // Escape LIKE pattern special characters for literal matching
  return escapeLikePattern(sanitized);
}

/**
 * Get ORDER BY expressions based on sort parameter
 */
function getOrderByExpressions(sort: AdminCreatorProfilesSort) {
  switch (sort) {
    case 'created_asc':
      return [creatorProfiles.createdAt];
    case 'verified_desc':
      return [desc(creatorProfiles.isVerified), desc(creatorProfiles.createdAt)];
    case 'verified_asc':
      return [creatorProfiles.isVerified, desc(creatorProfiles.createdAt)];
    case 'claimed_desc':
      return [desc(creatorProfiles.isClaimed), desc(creatorProfiles.createdAt)];
    case 'claimed_asc':
      return [creatorProfiles.isClaimed, desc(creatorProfiles.createdAt)];
    case 'created_desc':
    default:
      return [desc(creatorProfiles.createdAt)];
  }
}

/**
 * Backfill claim tokens for unclaimed profiles that don't have one
 */
async function backfillClaimTokens(
  pageRows: Array<{
    id: string;
    isClaimed: boolean | null;
    claimToken: string | null;
  }>
): Promise<void> {
  const needsToken = pageRows.filter(row => !row.isClaimed && !row.claimToken);

  if (needsToken.length === 0) return;

  const tokensById = new Map<string, { token: string; expiresAt: Date }>();

  await Promise.all(
    needsToken.map(async row => {
      const token = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS);
      tokensById.set(row.id, { token, expiresAt });

      await db
        .update(creatorProfiles)
        .set({
          claimToken: token,
          claimTokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, row.id));
    })
  );

  // Update in-memory rows so callers immediately see the new tokens
  for (const row of pageRows) {
    const tokenData = tokensById.get(row.id);
    if (tokenData) {
      (row as { claimToken?: string | null }).claimToken = tokenData.token;
      (row as { claimTokenExpiresAt?: Date | null }).claimTokenExpiresAt =
        tokenData.expiresAt;
    }
  }
}

/**
 * Parse a raw confidence value to a clamped number
 */
function parseConfidenceValue(rawValue: unknown): number | null {
  let parsedValue: number;

  if (typeof rawValue === 'number') {
    parsedValue = rawValue;
  } else if (rawValue != null) {
    parsedValue = Number(rawValue);
  } else {
    return null;
  }

  if (Number.isNaN(parsedValue)) return null;

  return Math.min(1, Math.max(0, parsedValue));
}

/**
 * Build a map of profile IDs to confidence scores
 */
function buildConfidenceMap(
  rows: Array<{ creatorProfileId: string; averageConfidence: unknown }>
): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows) {
    const value = parseConfidenceValue(row.averageConfidence);
    if (value !== null) {
      map.set(row.creatorProfileId, value);
    }
  }

  return map;
}

/** Social link data structure */
interface SocialLinkData {
  id: string;
  platform: string;
  platformType: string;
  url: string;
  displayText: string | null;
}

/**
 * Build a map of profile IDs to their social links
 */
function buildSocialLinksMap(
  rows: Array<{
    id: string;
    creatorProfileId: string;
    platform: string;
    platformType: string;
    url: string;
    displayText: string | null;
  }>
): Map<string, SocialLinkData[]> {
  const map = new Map<string, SocialLinkData[]>();

  for (const link of rows) {
    const existing = map.get(link.creatorProfileId) ?? [];
    existing.push({
      id: link.id,
      platform: link.platform,
      platformType: link.platformType,
      url: link.url,
      displayText: link.displayText,
    });
    map.set(link.creatorProfileId, existing);
  }

  return map;
}

export async function getAdminCreatorProfiles(
  params: AdminCreatorProfilesParams = {}
): Promise<AdminCreatorProfilesResult> {
  const rawPage = Number.isFinite(params.page) ? (params.page ?? 1) : 1;
  const rawPageSize = Number.isFinite(params.pageSize)
    ? (params.pageSize ?? 20)
    : 20;

  const page = Math.max(rawPage || 1, 1);
  const pageSize = Math.min(Math.max(rawPageSize || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sanitizedSearch = sanitizeSearchInput(params.search);
  const likePattern = sanitizedSearch ? `%${sanitizedSearch}%` : null;

  const sort: AdminCreatorProfilesSort = params.sort ?? 'created_desc';
  const orderByExpressions = getOrderByExpressions(sort);

  const whereClause: SQL | undefined = likePattern
    ? or(
        ilike(creatorProfiles.username, likePattern),
        ilike(creatorProfiles.displayName, likePattern)
      )
    : undefined;

  try {
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
          avatarUrl: creatorProfiles.avatarUrl,
          displayName: creatorProfiles.displayName,
          isVerified: creatorProfiles.isVerified,
          isFeatured: creatorProfiles.isFeatured,
          marketingOptOut: creatorProfiles.marketingOptOut,
          isClaimed: creatorProfiles.isClaimed,
          claimToken: creatorProfiles.claimToken,
          claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
          userId: creatorProfiles.userId,
          createdAt: creatorProfiles.createdAt,
          ingestionStatus: creatorProfiles.ingestionStatus,
          lastIngestionError: creatorProfiles.lastIngestionError,
        })
        .from(creatorProfiles)
        .where(whereClause)
        .orderBy(...orderByExpressions)
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(creatorProfiles).where(whereClause),
    ]);

    await backfillClaimTokens(rows);

    const profileIds = rows.map(row => row.id);
    let confidenceMap = new Map<string, number>();
    let socialLinksMap = new Map<string, SocialLinkData[]>();

    if (profileIds.length > 0) {
      const [confidenceRows, socialLinksRows] = await Promise.all([
        db
          .select({
            creatorProfileId: socialLinks.creatorProfileId,
            averageConfidence: drizzleSql`AVG(${socialLinks.confidence})`,
          })
          .from(socialLinks)
          .where(inArray(socialLinks.creatorProfileId, profileIds))
          .groupBy(socialLinks.creatorProfileId),
        db
          .select({
            id: socialLinks.id,
            creatorProfileId: socialLinks.creatorProfileId,
            platform: socialLinks.platform,
            platformType: socialLinks.platformType,
            url: socialLinks.url,
            displayText: socialLinks.displayText,
          })
          .from(socialLinks)
          .where(inArray(socialLinks.creatorProfileId, profileIds)),
      ]);

      confidenceMap = buildConfidenceMap(confidenceRows);
      socialLinksMap = buildSocialLinksMap(socialLinksRows);
    }

    return {
      profiles: rows.map(row => ({
        id: row.id,
        username: row.username,
        usernameNormalized: row.usernameNormalized,
        avatarUrl: row.avatarUrl ?? null,
        displayName:
          (row as { displayName?: string | null }).displayName ?? null,
        isVerified: row.isVerified ?? false,
        isFeatured: row.isFeatured ?? false,
        marketingOptOut: row.marketingOptOut ?? false,
        isClaimed: row.isClaimed ?? false,
        claimToken: row.claimToken ?? null,
        claimTokenExpiresAt:
          (row as { claimTokenExpiresAt?: Date | null }).claimTokenExpiresAt ??
          null,
        userId: row.userId ?? null,
        createdAt: row.createdAt ?? null,
        confidence: confidenceMap.get(row.id) ?? null,
        ingestionStatus: row.ingestionStatus ?? 'idle',
        lastIngestionError: row.lastIngestionError ?? null,
        socialLinks: socialLinksMap.get(row.id) ?? [],
      })),
      page,
      pageSize,
      total,
    };
  } catch (error) {
    console.error('Error loading admin creator profiles', error);

    return {
      profiles: [],
      page,
      pageSize,
      total: 0,
    };
  }
}
