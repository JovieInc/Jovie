import { NextResponse } from 'next/server';

import {
  type AdminReleasesSort,
  adminReleasesSortFields,
  getAdminReleases,
} from '@/lib/admin/releases';
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
  const page = Math.min(
    10000,
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  );
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20)
  );
  const rawSort = searchParams.get('sort') ?? 'release_date_desc';
  const q = searchParams.get('q') ?? '';

  // Runtime validate sort param
  if (!adminReleasesSortFields.includes(rawSort as AdminReleasesSort)) {
    return NextResponse.json(
      { error: `Invalid sort: ${rawSort}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const sort = rawSort as AdminReleasesSort;

  const result = await getAdminReleases({
    page,
    pageSize,
    sort,
    search: q,
  });

  return NextResponse.json(
    {
      rows: result.releases.map(release => ({
        ...release,
        releaseDate: release.releaseDate?.toISOString() ?? null,
        createdAt: release.createdAt?.toISOString() ?? null,
      })),
      total: result.total,
    },
    { headers: NO_STORE_HEADERS }
  );
}
