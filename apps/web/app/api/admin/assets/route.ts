import { NextResponse } from 'next/server';
import {
  type AdminAssetIssuesFilter,
  type AdminAssetSort,
  type AdminAssetType,
  type AdminAssetVerifiedFilter,
  adminAssetIssuesFilters,
  adminAssetSortFields,
  adminAssetTypes,
  adminAssetVerifiedFilters,
  getAdminAssets,
} from '@/lib/admin/assets';
import { requireAdmin } from '@/lib/admin/middleware';
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
  const rawSort = searchParams.get('sort') ?? 'created_desc';
  const rawType = searchParams.get('type') ?? 'all';
  const rawIssues = searchParams.get('issues') ?? 'all';
  const rawVerified = searchParams.get('verified') ?? 'all';
  const q = searchParams.get('q') ?? '';

  if (!adminAssetSortFields.includes(rawSort as AdminAssetSort)) {
    return NextResponse.json(
      { error: `Invalid sort: ${rawSort}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (
    rawType !== 'all' &&
    !adminAssetTypes.includes(rawType as AdminAssetType)
  ) {
    return NextResponse.json(
      { error: `Invalid type: ${rawType}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (!adminAssetIssuesFilters.includes(rawIssues as AdminAssetIssuesFilter)) {
    return NextResponse.json(
      { error: `Invalid issues filter: ${rawIssues}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (
    !adminAssetVerifiedFilters.includes(rawVerified as AdminAssetVerifiedFilter)
  ) {
    return NextResponse.json(
      { error: `Invalid verified filter: ${rawVerified}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await getAdminAssets({
      page,
      pageSize,
      sort: rawSort as AdminAssetSort,
      type: rawType as AdminAssetType | 'all',
      issues: rawIssues as AdminAssetIssuesFilter,
      verified: rawVerified as AdminAssetVerifiedFilter,
      search: q,
    });

    return NextResponse.json(
      {
        rows: result.assets.map(asset => ({
          ...asset,
          createdAt: asset.createdAt?.toISOString() ?? null,
        })),
        total: result.total,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('Failed to fetch admin assets', error);
    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
