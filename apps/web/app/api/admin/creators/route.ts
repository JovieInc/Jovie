import { NextResponse } from 'next/server';

import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const sort = (searchParams.get('sort') ??
    'created_desc') as AdminCreatorProfilesSort;
  const q = searchParams.get('q') ?? '';

  const result = await getAdminCreatorProfiles({
    page,
    pageSize,
    sort,
    search: q,
  });

  return NextResponse.json(
    {
      rows: result.profiles.map(profile => ({
        ...profile,
        createdAt: profile.createdAt?.toISOString() ?? null,
        claimTokenExpiresAt: profile.claimTokenExpiresAt?.toISOString() ?? null,
      })),
      total: result.total,
    },
    { headers: NO_STORE_HEADERS }
  );
}
