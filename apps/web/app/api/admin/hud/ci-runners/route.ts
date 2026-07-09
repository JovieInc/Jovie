/**
 * HUD CI Runners API — reports autoscaler status to the Ovie dashboard.
 *
 * The autoscaler runs on gem-linux (Tailscale 100.105.87.117) and exposes
 * a status endpoint. This API proxies that status for the HUD frontend.
 *
 * When gem-linux is unreachable, returns the model routing config and
 * a gemLinuxStatus of 'offline' so the dashboard still shows useful info.
 *
 * @see apps/web/lib/hud/ci-runners/ for the core autoscaler library
 */

import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { listRoutes } from '@/lib/hud/ci-runners/router';
import { logger } from '@/lib/utils/logger';
import type { HudCiRunnerStatusPayload } from '@/lib/hud/ci-runners/types';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Where the autoscaler status endpoint lives on gem-linux. */
const GEM_LINUX_STATUS_URL =
  process.env.AUTOSCALER_STATUS_URL ?? 'http://100.105.87.117:8901/status';

async function fetchGemLinuxStatus(): Promise<{
  readonly online: boolean;
  readonly payload?: Record<string, unknown>;
}> {
  try {
    const response = await fetch(GEM_LINUX_STATUS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { online: false };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return { online: true, payload };
  } catch {
    return { online: false };
  }
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const gemStatus = await fetchGemLinuxStatus();
    const routes = listRoutes();

    const payload: HudCiRunnerStatusPayload = {
      availability: gemStatus.online ? 'available' : 'unavailable',
      state: gemStatus.online ? 'running' : 'unknown',
      config: null,
      stateSnapshot: null,
      lastError: null,
      modelRoutes: routes,
      gemLinuxStatus: gemStatus.online ? 'online' : 'offline',
      runners: [],
    };

    if (gemStatus.payload) {
      payload.config =
        (gemStatus.payload.config as HudCiRunnerStatusPayload['config']) ??
        null;
      payload.stateSnapshot =
        (gemStatus.payload
          .state as HudCiRunnerStatusPayload['stateSnapshot']) ?? null;
      payload.runners =
        (gemStatus.payload
          .runners as HudCiRunnerStatusPayload['runners']) ?? [];
      payload.lastError =
        (gemStatus.payload.lastError as string | null) ?? null;
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/ci-runners] Failed to load autoscaler status',
      error,
    );
    await captureError('HUD CI runners status failed', error, {
      route: '/api/admin/hud/ci-runners',
      method: 'GET',
    });

    return NextResponse.json(
      {
        availability: 'unavailable',
        state: 'error',
        gemLinuxStatus: 'offline',
        modelRoutes: listRoutes(),
      } satisfies HudCiRunnerStatusPayload,
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
