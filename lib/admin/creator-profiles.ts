'server only';

import { count, desc, ilike, or, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

export interface AdminCreatorProfileRow {
  id: string;
  username: string;
  avatarUrl: string | null;
  displayName?: string | null;
  isVerified: boolean;
  isClaimed: boolean;
  createdAt: Date | null;
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
  const sanitized = limited.replace(/[^a-zA-Z0-9_\-\s]/g, '');

  return sanitized.length > 0 ? sanitized : undefined;
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

  // Execute queries in parallel for better performance
  const [rows, [{ value: total }]] = await Promise.all([
    // Paginated data query
    db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        avatarUrl: creatorProfiles.avatarUrl,
        displayName: creatorProfiles.displayName,
        isVerified: creatorProfiles.isVerified,
        isClaimed: creatorProfiles.isClaimed,
        createdAt: creatorProfiles.createdAt,
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

  return {
    profiles: pageRows.map(row => ({
      id: row.id,
      username: row.username,
      avatarUrl: row.avatarUrl ?? null,
      // displayName is optional in the admin listing but useful for detail views
      displayName: (row as { displayName?: string | null }).displayName ?? null,
      isVerified: row.isVerified ?? false,
      isClaimed: row.isClaimed ?? false,
      createdAt: row.createdAt ?? null,
    })),
    page,
    pageSize,
    total,
  };
}
