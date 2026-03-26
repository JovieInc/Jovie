import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import {
  type AdminReleasesSort,
  adminReleasesSortFields,
  getAdminReleases,
} from '@/lib/admin/releases';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

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

  try {
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
  } catch (error) {
    captureError('Failed to fetch admin releases', error);
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
