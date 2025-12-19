export const runtime = 'nodejs';

import { count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { env } from '@/lib/env-server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  const summary: Record<string, unknown> = {
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || 'local',
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || null,
  };

  try {
    const databaseUrl = env.DATABASE_URL;

    if (!databaseUrl) {
      summary.status = 'degraded';
      summary.database = { ok: false, error: 'missing_database_url' };
      return NextResponse.json(summary, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    // Count public creator profiles (seed invariant: should be >= 3)
    const result = await db
      .select({ count: count() })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.isPublic, true));

    const profileCount = result[0]?.count ?? 0;

    summary.status = 'ok';
    summary.database = { ok: true, publicProfiles: profileCount };
    return NextResponse.json(summary, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (e) {
    summary.status = 'degraded';
    summary.database = {
      ok: false,
      error: e instanceof Error ? e.message : 'unknown',
    };
    return NextResponse.json(summary, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  }
}
