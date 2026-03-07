'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { PAGINATED_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export type AdminUsersSort =
  | 'created_desc'
  | 'created_asc'
  | 'name_desc'
  | 'name_asc'
  | 'email_desc'
  | 'email_asc';

export type AdminCreatorProfilesSort =
  | 'created_desc'
  | 'created_asc'
  | 'verified_desc'
  | 'verified_asc'
  | 'claimed_desc'
  | 'claimed_asc';

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
  plan: 'free' | 'pro';
  profileUsername: string | null;
}

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

export interface WaitlistEntryRow {
  id: string;
  fullName: string;
  email: string;
  primaryGoal: string | null;
  primarySocialUrl: string;
  primarySocialPlatform: string;
  primarySocialUrlNormalized: string;
  spotifyUrl: string | null;
  spotifyUrlNormalized: string | null;
  spotifyArtistName: string | null;
  heardAbout: string | null;
  status: 'new' | 'invited' | 'claimed';
  primarySocialFollowerCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InfinitePage<T> {
  rows: T[];
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;

const parseDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
};

async function fetchPage<T>(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  return (await res.json()) as InfinitePage<T>;
}

export function useAdminUsersInfiniteQuery({
  sort,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  initialData,
}: {
  sort: AdminUsersSort;
  search: string;
  pageSize?: number;
  initialData?: InfinitePage<AdminUserRow>;
}) {
  return useInfiniteQuery<InfinitePage<AdminUserRow>>({
    queryKey: queryKeys.adminUsers.list({ sort, search, pageSize }),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
        sort,
        q: search,
      });
      const page = await fetchPage<AdminUserRow>(
        `/api/admin/users?${params.toString()}`,
        signal
      );
      return {
        ...page,
        rows: page.rows.map(row => ({
          ...row,
          createdAt: new Date(row.createdAt),
          deletedAt: parseDate(row.deletedAt),
        })),
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + page.rows.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    initialData: initialData
      ? { pages: [initialData], pageParams: [1] }
      : undefined,
    ...PAGINATED_CACHE,
  });
}

export function useAdminCreatorsInfiniteQuery({
  sort,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  initialData,
}: {
  sort: AdminCreatorProfilesSort;
  search: string;
  pageSize?: number;
  initialData?: InfinitePage<AdminCreatorProfileRow>;
}) {
  return useInfiniteQuery<InfinitePage<AdminCreatorProfileRow>>({
    queryKey: queryKeys.creators.list({ sort, search, pageSize }),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
        sort,
        q: search,
      });
      const page = await fetchPage<AdminCreatorProfileRow>(
        `/api/admin/creators?${params.toString()}`,
        signal
      );
      return {
        ...page,
        rows: page.rows.map(row => ({
          ...row,
          createdAt: parseDate(row.createdAt),
          claimTokenExpiresAt: parseDate(row.claimTokenExpiresAt),
        })),
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + page.rows.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    initialData: initialData
      ? { pages: [initialData], pageParams: [1] }
      : undefined,
    ...PAGINATED_CACHE,
  });
}

export function useAdminWaitlistInfiniteQuery({
  pageSize = DEFAULT_PAGE_SIZE,
  initialData,
}: {
  pageSize?: number;
  initialData?: InfinitePage<WaitlistEntryRow>;
}) {
  return useInfiniteQuery<InfinitePage<WaitlistEntryRow>>({
    queryKey: queryKeys.waitlist.list({ pageSize }),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
      });
      const page = await fetchPage<WaitlistEntryRow>(
        `/api/admin/waitlist?${params.toString()}`,
        signal
      );
      return {
        ...page,
        rows: page.rows.map(row => ({
          ...row,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        })),
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, page) => acc + page.rows.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    initialData: initialData
      ? { pages: [initialData], pageParams: [1] }
      : undefined,
    ...PAGINATED_CACHE,
  });
}
