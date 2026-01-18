import { NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Required Keys Health Check Endpoint (ENG-004)
 *
 * Verifies that all MVP-critical environment variables are present.
 * Returns 503 if any required keys are missing.
 *
 * This endpoint provides a quick way to verify environment configuration
 * without testing actual service connectivity.
 *
 * Note: For security, this endpoint does NOT expose actual key values,
 * only their presence/absence status.
 */

const REQUIRED_KEYS = [
  {
    key: 'DATABASE_URL',
    label: 'Database',
    check: () => Boolean(env.DATABASE_URL),
  },
  {
    key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    label: 'Auth (Clerk Public)',
    check: () => Boolean(publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  },
  {
    key: 'CLERK_SECRET_KEY',
    label: 'Auth (Clerk Secret)',
    check: () => Boolean(env.CLERK_SECRET_KEY),
  },
] as const;

const RECOMMENDED_KEYS = [
  {
    key: 'NEXT_PUBLIC_APP_URL',
    label: 'App URL',
    check: () => Boolean(publicEnv.NEXT_PUBLIC_APP_URL),
  },
  {
    key: 'STATSIG_SERVER_API_KEY',
    label: 'Feature Flags',
    check: () => Boolean(env.STATSIG_SERVER_API_KEY),
  },
  {
    key: 'STRIPE_SECRET_KEY',
    label: 'Payments',
    check: () => Boolean(env.STRIPE_SECRET_KEY),
  },
] as const;

export async function GET() {
  const now = new Date().toISOString();

  // Check required keys
  const requiredResults = REQUIRED_KEYS.map(({ key, label, check }) => ({
    label,
    present: check(),
  }));

  // Check recommended keys
  const recommendedResults = RECOMMENDED_KEYS.map(({ key, label, check }) => ({
    label,
    present: check(),
  }));

  const missingRequired = requiredResults.filter(r => !r.present);
  const missingRecommended = recommendedResults.filter(r => !r.present);

  const allRequiredPresent = missingRequired.length === 0;

  const response = {
    status: allRequiredPresent ? 'ok' : 'error',
    ok: allRequiredPresent,
    timestamp: now,
    required: {
      total: REQUIRED_KEYS.length,
      present: requiredResults.filter(r => r.present).length,
      missing: missingRequired.map(r => r.label),
    },
    recommended: {
      total: RECOMMENDED_KEYS.length,
      present: recommendedResults.filter(r => r.present).length,
      missing: missingRecommended.map(r => r.label),
    },
  };

  return NextResponse.json(response, {
    status: allRequiredPresent ? 200 : 503,
    headers: NO_STORE_HEADERS,
  });
}
