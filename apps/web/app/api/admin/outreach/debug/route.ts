import { count, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { env } from '@/lib/env';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import { searchWebWithStatus } from '@/lib/leads/google-cse';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';
import {
  developmentOnlyForbiddenJson,
  isExplicitDevelopmentEnvironment,
} from '@/lib/security/development-only';
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
      present: !!env.INSTANTLY_API_KEY,
      required: true,
    },
    INSTANTLY_CAMPAIGN_ID: {
      present: !!env.INSTANTLY_CAMPAIGN_ID,
      required: true,
    },
    SERPAPI_API_KEY: {
      present: !!env.SERPAPI_API_KEY,
      required: false,
    },
    EXA_API_KEY: {
      present: !!env.EXA_API_KEY,
      required: false,
    },
    SPOTIFY_CLIENT_ID: {
      present: !!env.SPOTIFY_CLIENT_ID,
      required: true,
    },
    SPOTIFY_CLIENT_SECRET: {
      present: !!env.SPOTIFY_CLIENT_SECRET,
      required: true,
    },
  };

  const missingRequired = Object.entries(vars)
    .filter(([, v]) => v.required && !v.present)
    .map(([k]) => k);
  if (!env.SERPAPI_API_KEY && !env.EXA_API_KEY) {
    missingRequired.push('SERPAPI_API_KEY or EXA_API_KEY');
  }

  return { vars, missingRequired };
}

// ---------------------------------------------------------------------------
// Connectivity probes
// ---------------------------------------------------------------------------

async function probeInstantly(): Promise<ConnectivityResult> {
  const apiKey = env.INSTANTLY_API_KEY;
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
    const res = await serverFetch(
      'https://api.instantly.ai/api/v2/campaigns?limit=1',
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 10_000,
        context: 'Instantly connectivity probe',
        retry: {
          maxRetries: 1,
          baseDelayMs: 300,
        },
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
    if (err instanceof ServerFetchTimeoutError) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }

    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeSearchProvider(): Promise<ConnectivityResult> {
  const start = Date.now();
  try {
    const outcome = await searchWebWithStatus('music artist', 1);
    const latencyMs = Date.now() - start;

    if (
      outcome.status === 'ok' ||
      outcome.status === 'empty' ||
      outcome.status === 'quota_exceeded'
    ) {
      return { ok: true, latencyMs };
    }

    return {
      ok: false,
      latencyMs,
      ...(outcome.status === 'not_configured' ? { skipped: true } : {}),
      error: outcome.error ?? `Search provider returned ${outcome.status}`,
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
    const { spotifyClient } = await import('@/lib/spotify');
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
  if (!isExplicitDevelopmentEnvironment()) {
    return developmentOnlyForbiddenJson(undefined, {
      headers: NO_STORE_HEADERS,
    });
  }

  const entitlements = await getOvieOperatorEntitlements({ purpose: 'read' });
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
    const [instantly, search, spotify, pipeline, recentFailures] =
      await Promise.all([
        probeInstantly(),
        probeSearchProvider(),
        probeSpotify(),
        getPipelineStats(),
        getRecentFailures(),
      ]);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        environment,
        connectivity: { instantly, search, spotify },
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
