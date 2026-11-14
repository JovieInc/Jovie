import { NextResponse } from 'next/server';

import { getAdminWaitlistEntries } from '@/lib/admin/waitlist';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function getHandler({ request }: OperatorRouteInput) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');

  const result = await getAdminWaitlistEntries({ page, pageSize });

  return NextResponse.json(
    {
      rows: result.entries.map(entry => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
      total: result.total,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export const GET = defineRoute(
  {
    route: '/api/admin/waitlist',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
