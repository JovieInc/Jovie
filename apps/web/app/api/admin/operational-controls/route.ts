import { NextRequest, NextResponse } from 'next/server';
import {
  getOperationalControls,
  updateOperationalControls,
} from '@/lib/admin/operational-controls';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getOptionalAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

interface UpdateOperationalControlsBody {
  readonly signupEnabled?: boolean;
  readonly checkoutEnabled?: boolean;
  readonly stripeWebhooksEnabled?: boolean;
  readonly cronFanoutEnabled?: boolean;
}

function formatControlsResponse(
  controls: Awaited<ReturnType<typeof getOperationalControls>>
) {
  return {
    signupEnabled: controls.signupEnabled,
    checkoutEnabled: controls.checkoutEnabled,
    stripeWebhooksEnabled: controls.stripeWebhooksEnabled,
    cronFanoutEnabled: controls.cronFanoutEnabled,
    updatedAt: controls.updatedAt?.toISOString() ?? null,
    updatedByUserId: controls.updatedByUserId,
  };
}

function validateOperationalControlsBody(
  body: UpdateOperationalControlsBody
): string | null {
  const entries = Object.entries(body);
  if (entries.length === 0) {
    return 'Provide at least one operational control to update';
  }

  for (const [key, value] of entries) {
    if (typeof value !== 'boolean') {
      return `${key} must be a boolean`;
    }
  }

  return null;
}

async function requireAdmin() {
  const { userId } = await getOptionalAuth();

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const isAdmin = await checkAdminRole(userId);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  return { userId };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;

    const controls = await getOperationalControls({ strict: true });

    return NextResponse.json(
      { ok: true, controls: formatControlsResponse(controls) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Operational Controls] Failed to fetch settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin operational controls GET failed', error, {
      route: '/api/admin/operational-controls',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch operational controls' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;

    const parsed = await parseJsonBody<UpdateOperationalControlsBody>(request, {
      route: '/api/admin/operational-controls',
      headers: NO_STORE_HEADERS,
    });
    if (!parsed.ok) return parsed.response;

    const validationError = validateOperationalControlsBody(parsed.data);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const controls = await updateOperationalControls(parsed.data, admin.userId);

    return NextResponse.json(
      { ok: true, controls: formatControlsResponse(controls) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Operational Controls] Failed to update settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin operational controls PATCH failed', error, {
      route: '/api/admin/operational-controls',
      method: 'PATCH',
    });
    return NextResponse.json(
      { error: 'Failed to update operational controls' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
