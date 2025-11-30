import { NextRequest, NextResponse } from 'next/server';
import { getAdminCreatorProfiles } from '@/lib/admin/creator-profiles';
import { isAdminEmail } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { apiRateLimit } from '@/lib/rate-limit';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(entitlements.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ip = extractClientIPFromRequest(request);

    if (apiRateLimit) {
      const rateResult = await apiRateLimit.limit(String(ip));
      if (!rateResult.success) {
        return NextResponse.json(
          {
            error: 'Too many requests. Please wait before trying again.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': Math.round(
                (rateResult.reset - Date.now()) / 1000
              ).toString(),
              'X-RateLimit-Limit': rateResult.limit.toString(),
              'X-RateLimit-Remaining': rateResult.remaining.toString(),
              'X-RateLimit-Reset': new Date(rateResult.reset).toISOString(),
            },
          }
        );
      }
    }

    const { searchParams } = new URL(request.url);

    const page = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = Number.parseInt(searchParams.get('pageSize') ?? '20', 10);
    const search = searchParams.get('q') ?? undefined;
    const sortParam = searchParams.get('sort');

    const result = await getAdminCreatorProfiles({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      search,
      sort:
        sortParam === 'created_asc' ||
        sortParam === 'verified_desc' ||
        sortParam === 'verified_asc' ||
        sortParam === 'claimed_desc' ||
        sortParam === 'claimed_asc'
          ? sortParam
          : 'created_desc',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in admin creator profiles API:', error);
    return NextResponse.json(
      { error: 'Failed to load creator profiles' },
      { status: 500 }
    );
  }
}
