import 'server-only';

import { count, desc, ilike, or, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export type AdminUserPlan = 'free' | 'pro';

export interface AdminUserRow {
  id: string;
  clerkId: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: AdminUserPlan;
}

export interface GetAdminUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
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

  // Keep this conservative: emails + names.
  const limited = trimmed.slice(0, 100);
  return limited.length > 0 ? limited : undefined;
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
          createdAt: users.createdAt,
          deletedAt: users.deletedAt,
          isPro: users.isPro,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(users).where(whereClause),
    ]);

    return {
      users: rows.map(row => ({
        id: row.id,
        clerkId: row.clerkId,
        name: row.name ?? null,
        email: row.email ?? null,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt ?? null,
        isPro: row.isPro ?? false,
        stripeCustomerId: row.stripeCustomerId ?? null,
        stripeSubscriptionId: row.stripeSubscriptionId ?? null,
        plan: derivePlan({
          isPro: row.isPro ?? false,
          stripeSubscriptionId: row.stripeSubscriptionId ?? null,
        }),
      })),
      page,
      pageSize,
      total,
    };
  } catch (error) {
    console.error('Error loading admin users', error);

    return {
      users: [],
      page,
      pageSize,
      total: 0,
    };
  }
}
