import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { getLybDailyMrr } from '@/lib/ovie/lyb-mrr.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The same product-scoped provider record is available to company read tools. */
export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/ovie/lyb-mrr',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;
  const record = await getLybDailyMrr();
  return NextResponse.json(record, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
