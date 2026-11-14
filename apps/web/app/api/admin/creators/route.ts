import { NextResponse } from 'next/server';

import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function getHandler({ request }: OperatorRouteInput) {
  const { searchParams } = new URL(request.url);
  const page = Math.min(
    10000,
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  );
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20)
  );
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

export const GET = defineRoute(
  {
    route: '/api/admin/creators',
    access: operatorAccess(),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
