/**
 * Slug migration sweep: dry-run by default. Reports planned renames per
 * qualifier type; applies only for handles listed in SLUG_MIGRATION_APPLY_HANDLES
 * (comma separated, or `*`). Old URLs keep working through redirects.
 * Optional ?handles=tim restricts the run.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runSlugMigration } from '@/lib/discography/slug-migration';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';
export const maxDuration = 300;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const ROUTE = '/api/cron/slug-migration';
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
    const report = await runSlugMigration({
      budgetMs: BUDGET_MS,
      handles,
      applyFlag: process.env.SLUG_MIGRATION_APPLY_HANDLES,
    });
    return NextResponse.json(
      { ok: true, ...report },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Slug migration sweep failed', error, {
      source: 'slug_migration',
      route: ROUTE,
    });
    return NextResponse.json(
      { ok: false, error: 'Slug migration sweep failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
