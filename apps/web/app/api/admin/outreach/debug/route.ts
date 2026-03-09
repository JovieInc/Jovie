import { count, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { isSpotifyConfigured, validateSpotifyEnv } from '@/lib/spotify/env';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

interface ConnectivityResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// ENV checks
// ---------------------------------------------------------------------------

function checkEnvVars() {
  const vars = {
    INSTANTLY_API_KEY: {
      present: !!process.env.INSTANTLY_API_KEY,
      required: true,
    },
    INSTANTLY_CAMPAIGN_ID: {
      present: !!process.env.INSTANTLY_CAMPAIGN_ID,
      required: true,
    },
    GOOGLE_CSE_API_KEY: {
      present: !!process.env.GOOGLE_CSE_API_KEY,
      required: true,
    },
    GOOGLE_CSE_ENGINE_ID: {
      present: !!process.env.GOOGLE_CSE_ENGINE_ID,
      required: true,
    },
    SPOTIFY_CLIENT_ID: {
      present: !!process.env.SPOTIFY_CLIENT_ID,
      required: true,
    },
    SPOTIFY_CLIENT_SECRET: {
      present: !!process.env.SPOTIFY_CLIENT_SECRET,
      required: true,
    },
  };

  const missingRequired = Object.entries(vars)
    .filter(([, v]) => v.required && !v.present)
    .map(([k]) => k);

  return { vars, missingRequired };
}

// ---------------------------------------------------------------------------
// Connectivity probes
// ---------------------------------------------------------------------------

async function probeInstantly(): Promise<ConnectivityResult> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      skipped: true,
      error: 'Missing INSTANTLY_API_KEY',
    };
  }

  const start = Date.now();
  try {
    const res = await fetch(
      'https://api.instantly.ai/api/v2/campaigns?limit=1',
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) return { ok: true, latencyMs };
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      latencyMs,
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeGoogleCSE(): Promise<ConnectivityResult> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const engineId = process.env.GOOGLE_CSE_ENGINE_ID;
  if (!apiKey || !engineId) {
    return {
      ok: false,
      latencyMs: 0,
      skipped: true,
      error: 'Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_ENGINE_ID',
    };
  }

  const start = Date.now();
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', engineId);
    url.searchParams.set('q', 'test');
    url.searchParams.set('num', '1');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - start;

    // 429 = quota exhausted but key is valid
    if (res.ok || res.status === 429) return { ok: true, latencyMs };
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      latencyMs,
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeSpotify(): Promise<ConnectivityResult> {
  if (!isSpotifyConfigured()) {
    const validation = validateSpotifyEnv();
    return {
      ok: false,
      latencyMs: 0,
      skipped: true,
      error:
        validation.errors?.join('; ') ??
        'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET',
    };
  }

  const start = Date.now();
  try {
    // Dynamic import to avoid pulling server-only module at module level
    const { spotifyClient } = await import('@/lib/spotify/client');
    const token = await spotifyClient.getAccessToken();
    const latencyMs = Date.now() - start;

    if (token) return { ok: true, latencyMs };
    return { ok: false, latencyMs, error: 'Failed to obtain access token' };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Pipeline stats
// ---------------------------------------------------------------------------

async function getPipelineStats() {
  const [
    statusCounts,
    outreachStatusCounts,
    outreachRouteCounts,
    [totalRow],
    settings,
  ] = await Promise.all([
    db
      .select({ status: leads.status, count: count() })
      .from(leads)
      .groupBy(leads.status),
    db
      .select({ outreachStatus: leads.outreachStatus, count: count() })
      .from(leads)
      .groupBy(leads.outreachStatus),
    db
      .select({ outreachRoute: leads.outreachRoute, count: count() })
      .from(leads)
      .groupBy(leads.outreachRoute),
    db.select({ total: count() }).from(leads),
    db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1),
  ]);

  const toMap = <T extends { count: number }>(
    rows: T[],
    keyFn: (r: T) => string | null
  ) => Object.fromEntries(rows.map(r => [keyFn(r) ?? 'null', r.count]));

  return {
    total: totalRow?.total ?? 0,
    byStatus: toMap(statusCounts, r => r.status),
    byOutreachStatus: toMap(outreachStatusCounts, r => r.outreachStatus),
    byOutreachRoute: toMap(outreachRouteCounts, r => r.outreachRoute),
    settings: settings[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recent failures
// ---------------------------------------------------------------------------

async function getRecentFailures() {
  return db
    .select({
      id: leads.id,
      linktreeHandle: leads.linktreeHandle,
      displayName: leads.displayName,
      status: leads.status,
      outreachStatus: leads.outreachStatus,
      outreachRoute: leads.outreachRoute,
      emailInvalid: leads.emailInvalid,
      emailInvalidReason: leads.emailInvalidReason,
      contactEmail: drizzleSql<string>`LEFT(${leads.contactEmail}, 3) || '***'`,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(eq(leads.outreachStatus, 'failed'))
    .orderBy(desc(leads.updatedAt))
    .limit(10);
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET() {
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

  try {
    const environment = checkEnvVars();

    // Run connectivity probes and pipeline stats in parallel
    const [instantly, googleCse, spotify, pipeline, recentFailures] =
      await Promise.all([
        probeInstantly(),
        probeGoogleCSE(),
        probeSpotify(),
        getPipelineStats(),
        getRecentFailures(),
      ]);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        environment,
        connectivity: { instantly, googleCse, spotify },
        pipeline,
        recentFailures,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Outreach debug endpoint failed', error, {
      route: '/api/admin/outreach/debug',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Debug endpoint failed') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
