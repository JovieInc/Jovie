import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { escapeLikePattern } from '@/lib/utils/sql';

export type AdminUserPlan = 'free' | 'pro';

export type AdminUsersSort =
  | 'created_desc'
  | 'created_asc'
  | 'name_desc'
  | 'name_asc'
  | 'email_desc'
  | 'email_asc';

export type AdminUserStatus =
  | 'waitlist_pending'
  | 'waitlist_approved'
  | 'profile_claimed'
  | 'onboarding_incomplete'
  | 'active'
  | 'suspended'
  | 'banned';

export interface AdminUserRow {
  id: string;
  clerkId: string;
  name: string | null;
  email: string | null;
  userStatus: AdminUserStatus;
  createdAt: Date;
  deletedAt: Date | null;
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: AdminUserPlan;
  profileUsername: string | null;
  founderWelcomeSentAt: Date | null;
  welcomeFailedAt: Date | null;
  outboundSuppressedAt: Date | null;
  suppressionFailedAt: Date | null;
  profileCreatedAt: Date | null;
  profileOrigin: string | null;
  socialLinks?: Array<{
    id: string;
    platform: string;
    platformType: string;
    url: string;
    displayText: string | null;
  }>;
}

export interface GetAdminUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: AdminUsersSort;
}

export interface GetAdminUsersResult {
  users: AdminUserRow[];
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

  // Escape LIKE pattern special characters for literal matching
  return escapeLikePattern(limited);
}

function derivePlan(row: {
  isPro: boolean;
  stripeSubscriptionId: string | null;
}): AdminUserPlan {
  if (row.isPro) return 'pro';
  if (row.stripeSubscriptionId) return 'pro';
  return 'free';
}

export async function getAdminUsers(
  params: GetAdminUsersParams = {}
): Promise<GetAdminUsersResult> {
  const rawPage = Number.isFinite(params.page) ? (params.page ?? 1) : 1;
  const rawPageSize = Number.isFinite(params.pageSize)
    ? (params.pageSize ?? 20)
    : 20;

  const page = Math.max(rawPage || 1, 1);
  const pageSize = Math.min(Math.max(rawPageSize || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sanitizedSearch = sanitizeSearchInput(params.search);
  const likePattern = sanitizedSearch ? `%${sanitizedSearch}%` : null;

  const sort: AdminUsersSort = params.sort ?? 'created_desc';
  const [sortColumn, sortDirection] = (() => {
    switch (sort) {
      case 'created_asc':
        return [users.createdAt, 'asc'] as const;
      case 'created_desc':
        return [users.createdAt, 'desc'] as const;
      case 'name_asc':
        return [users.name, 'asc'] as const;
      case 'name_desc':
        return [users.name, 'desc'] as const;
      case 'email_asc':
        return [users.email, 'asc'] as const;
      case 'email_desc':
        return [users.email, 'desc'] as const;
    }
  })();

  const orderByClause =
    sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const whereClause: SQL | undefined = likePattern
    ? or(ilike(users.email, likePattern), ilike(users.name, likePattern))
    : undefined;

  try {
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          clerkId: users.clerkId,
          name: users.name,
          email: users.email,
          userStatus: users.userStatus,
          createdAt: users.createdAt,
          deletedAt: users.deletedAt,
          isPro: users.isPro,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
          profileId: creatorProfiles.id,
          profileUsername: creatorProfiles.username,
          founderWelcomeSentAt: users.founderWelcomeSentAt,
          welcomeFailedAt: users.welcomeFailedAt,
          outboundSuppressedAt: users.outboundSuppressedAt,
          suppressionFailedAt: users.suppressionFailedAt,
          profileCreatedAt: creatorProfiles.createdAt,
          profileOrigin: creatorProfiles.ingestionSourcePlatform,
        })
        .from(users)
        .leftJoin(creatorProfiles, eq(users.id, creatorProfiles.userId))
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(users).where(whereClause),
    ]);

    const profileIds = rows
      .map(row => row.profileId)
      .filter((id): id is string => typeof id === 'string');

    const socialLinksRows =
      profileIds.length > 0
        ? await db
            .select({
              id: socialLinks.id,
              creatorProfileId: socialLinks.creatorProfileId,
              platform: socialLinks.platform,
              platformType: socialLinks.platformType,
              url: socialLinks.url,
              displayText: socialLinks.displayText,
            })
            .from(socialLinks)
            .where(
              and(
                inArray(socialLinks.creatorProfileId, profileIds),
                ne(socialLinks.state, 'rejected')
              )
            )
        : [];

    const socialLinksByProfileId = new Map<
      string,
      Array<{
        id: string;
        platform: string;
        platformType: string;
        url: string;
        displayText: string | null;
      }>
    >();

    for (const link of socialLinksRows) {
      if (!link.creatorProfileId) continue;
      const existing = socialLinksByProfileId.get(link.creatorProfileId) ?? [];
      if (link.platformType == null) continue;
      if (link.platform === '' || link.url === '') continue;
      existing.push({
        id: link.id,
        platform: link.platform,
        platformType: link.platformType,
        url: link.url,
        displayText: link.displayText,
      });
      socialLinksByProfileId.set(link.creatorProfileId, existing);
    }

    return {
      users: rows.map(row => ({
        id: row.id,
        clerkId: row.clerkId,
        name: row.name ?? null,
        email: row.email ?? null,
        userStatus: row.userStatus,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt ?? null,
        isPro: row.isPro ?? false,
        stripeCustomerId: row.stripeCustomerId ?? null,
        stripeSubscriptionId: row.stripeSubscriptionId ?? null,
        plan: derivePlan({
          isPro: row.isPro ?? false,
          stripeSubscriptionId: row.stripeSubscriptionId ?? null,
        }),
        profileUsername: row.profileUsername ?? null,
        founderWelcomeSentAt: row.founderWelcomeSentAt ?? null,
        welcomeFailedAt: row.welcomeFailedAt ?? null,
        outboundSuppressedAt: row.outboundSuppressedAt ?? null,
        suppressionFailedAt: row.suppressionFailedAt ?? null,
        profileCreatedAt: row.profileCreatedAt ?? null,
        profileOrigin: row.profileOrigin ?? null,
        socialLinks: row.profileId
          ? (socialLinksByProfileId.get(row.profileId) ?? [])
          : [],
      })),
      page,
      pageSize,
      total,
    };
  } catch (error) {
    captureError('Error loading admin users', error, {
      page,
      pageSize,
      search: params.search,
    });

    return {
      users: [],
      page,
      pageSize,
      total: 0,
    };
  }
}
