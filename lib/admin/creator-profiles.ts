'server only';

import { desc, ilike, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

export interface AdminCreatorProfileRow {
  id: string;
  username: string;
  avatarUrl: string | null;
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

  const search = params.search?.trim();
  const likePattern = search && search.length > 0 ? `%${search}%` : null;

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

  const rows = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      avatarUrl: creatorProfiles.avatarUrl,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      createdAt: creatorProfiles.createdAt,
    })
    .from(creatorProfiles)
    .where(
      likePattern
        ? or(
            ilike(creatorProfiles.username, likePattern),
            ilike(creatorProfiles.displayName, likePattern)
          )
        : undefined
    )
    .orderBy(...orderByExpressions);

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + pageSize);

  return {
    profiles: pageRows.map(row => ({
      id: row.id,
      username: row.username,
      avatarUrl: row.avatarUrl ?? null,
      isVerified: row.isVerified ?? false,
      isClaimed: row.isClaimed ?? false,
      createdAt: row.createdAt ?? null,
    })),
    page,
    pageSize,
    total,
  };
}
