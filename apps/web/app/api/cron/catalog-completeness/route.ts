/**
 * Catalog completeness sweep. Re-imports artist catalogs so every release
 * version and its public approval exist, and reports counts.
 * Optional ?handles=tim,other runs those handles first/only.
 * Schedule: every 30 minutes (stalest profiles first, time-budgeted).
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runCatalogCompleteness } from '@/lib/discography/catalog-completeness';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';
export const maxDuration = 300;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const ROUTE = '/api/cron/catalog-completeness';
const BUDGET_MS = 200_000;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, { route: ROUTE });
  if (authError) return authError;

  const handles = new URL(request.url).searchParams
    .get('handles')
    ?.split(',')
    .map(h => h.trim())
    .filter(Boolean);

  try {
    const report = await runCatalogCompleteness({
      budgetMs: BUDGET_MS,
      handles,
    });
    return NextResponse.json(
      { ok: report.totals.failed === 0, ...report },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Catalog completeness sweep failed', error, {
      source: 'catalog_completeness',
      route: ROUTE,
    });
    return NextResponse.json(
      { ok: false, error: 'Catalog completeness sweep failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
