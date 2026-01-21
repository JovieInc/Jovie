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

  const orderByExpressions = (() => {
    switch (sort) {
      case 'created_asc':
        return [creatorProfiles.createdAt];
      case 'verified_desc':
        return [
          desc(creatorProfiles.isVerified),
          desc(creatorProfiles.createdAt),
        ];
      case 'verified_asc':
        return [creatorProfiles.isVerified, desc(creatorProfiles.createdAt)];
      case 'claimed_desc':
        return [
          desc(creatorProfiles.isClaimed),
          desc(creatorProfiles.createdAt),
        ];
      case 'claimed_asc':
        return [creatorProfiles.isClaimed, desc(creatorProfiles.createdAt)];
      case 'created_desc':
      default:
        return [desc(creatorProfiles.createdAt)];
    }
  })();

  // Build where clause for reuse in both queries
  const whereClause: SQL | undefined = likePattern
    ? or(
        ilike(creatorProfiles.username, likePattern),
        ilike(creatorProfiles.displayName, likePattern)
      )
    : undefined;

  try {
    // Execute queries in parallel for better performance
    const [rows, [{ value: total }]] = await Promise.all([
      // Paginated data query
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
      // Total count query
      db
        .select({ value: count() })
        .from(creatorProfiles)
        .where(whereClause),
    ]);

    const pageRows = rows;

    // Legacy backfill: Ensure unclaimed profiles have a claim token.
    // NOTE: New profiles should have tokens generated at creation time.
    // This backfill is temporary for legacy rows without tokens.
    const needsToken = pageRows.filter(
      row => !row.isClaimed && !row.claimToken
    );

    if (needsToken.length > 0) {
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

      // Update in-memory rows so callers immediately see the new tokens.
      for (const row of pageRows) {
        const tokenData = tokensById.get(row.id);
        if (tokenData) {
          (row as { claimToken?: string | null }).claimToken = tokenData.token;
          (row as { claimTokenExpiresAt?: Date | null }).claimTokenExpiresAt =
            tokenData.expiresAt;
        }
      }
    }

    const profileIds = pageRows.map(row => row.id);
    const confidenceMap = new Map<string, number>();
    const socialLinksMap = new Map<
      string,
      Array<{
        id: string;
        platform: string;
        platformType: string;
        url: string;
        displayText: string | null;
      }>
    >();

    if (profileIds.length > 0) {
      const [confidenceRows, socialLinksRows] = await Promise.all([
        // Fetch confidence scores
        db
          .select({
            creatorProfileId: socialLinks.creatorProfileId,
            averageConfidence: drizzleSql`AVG(${socialLinks.confidence})`,
          })
          .from(socialLinks)
          .where(inArray(socialLinks.creatorProfileId, profileIds))
          .groupBy(socialLinks.creatorProfileId),
        // Fetch social links
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

      for (const row of confidenceRows) {
        const rawValue = row.averageConfidence;
        let parsedValue: number;
        if (typeof rawValue === 'number') {
          parsedValue = rawValue;
        } else if (rawValue != null) {
          parsedValue = Number(rawValue);
        } else {
          parsedValue = Number.NaN;
        }

        if (!Number.isNaN(parsedValue)) {
          const clamped = Math.min(1, Math.max(0, parsedValue));
          confidenceMap.set(row.creatorProfileId, clamped);
        }
      }

      // Group social links by creator profile ID
      for (const link of socialLinksRows) {
        const existing = socialLinksMap.get(link.creatorProfileId) ?? [];
        existing.push({
          id: link.id,
          platform: link.platform,
          platformType: link.platformType,
          url: link.url,
          displayText: link.displayText,
        });
        socialLinksMap.set(link.creatorProfileId, existing);
      }
    }

    return {
      profiles: pageRows.map(row => ({
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
