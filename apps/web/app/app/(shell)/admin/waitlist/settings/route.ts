import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { waitlistSettingsUpdateSchema } from '@/lib/validation/schemas';
import {
  getWaitlistSettings,
  updateWaitlistSettings,
} from '@/lib/waitlist/settings';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function forbiddenResponse(status: 401 | 403) {
  return NextResponse.json(
    {
      success: false,
      error: status === 401 ? 'Unauthorized' : 'Forbidden',
    },
    { status, headers: NO_STORE_HEADERS }
  );
}

export async function GET() {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) return forbiddenResponse(401);
    if (!entitlements.isAdmin) return forbiddenResponse(403);

    const settings = await getWaitlistSettings();
    return NextResponse.json(
      {
        success: true,
        settings: {
          ...settings,
          autoAcceptResetsAt: settings.autoAcceptResetsAt.toISOString(),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: load waitlist settings',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: APP_ROUTES.ADMIN_WAITLIST_SETTINGS,
        action: 'load_waitlist_settings',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );
    logger.error('Failed to load waitlist settings', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to load waitlist settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: Request) {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) return forbiddenResponse(401);
    if (!entitlements.isAdmin) return forbiddenResponse(403);

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: `PATCH ${APP_ROUTES.ADMIN_WAITLIST_SETTINGS}`,
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = waitlistSettingsUpdateSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const settings = await updateWaitlistSettings(parsed.data);
    return NextResponse.json(
      {
        success: true,
        settings: {
          ...settings,
          autoAcceptResetsAt: settings.autoAcceptResetsAt.toISOString(),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: update waitlist settings',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: APP_ROUTES.ADMIN_WAITLIST_SETTINGS,
        action: 'update_waitlist_settings',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );
    logger.error('Failed to update waitlist settings', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to update waitlist settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
