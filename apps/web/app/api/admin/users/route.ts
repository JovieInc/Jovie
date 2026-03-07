import { NextResponse } from 'next/server';

import { type AdminUsersSort, getAdminUsers } from '@/lib/admin/users';
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
  const sort = (searchParams.get('sort') ?? 'created_desc') as AdminUsersSort;
  const q = searchParams.get('q') ?? '';

  const result = await getAdminUsers({
    page,
    pageSize,
    sort,
    search: q,
  });

  return NextResponse.json(
    {
      rows: result.users.map(user => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        deletedAt: user.deletedAt?.toISOString() ?? null,
        founderWelcomeSentAt: user.founderWelcomeSentAt?.toISOString() ?? null,
        welcomeFailedAt: user.welcomeFailedAt?.toISOString() ?? null,
        outboundSuppressedAt: user.outboundSuppressedAt?.toISOString() ?? null,
        suppressionFailedAt: user.suppressionFailedAt?.toISOString() ?? null,
      })),
      total: result.total,
    },
    { headers: NO_STORE_HEADERS }
  );
}
