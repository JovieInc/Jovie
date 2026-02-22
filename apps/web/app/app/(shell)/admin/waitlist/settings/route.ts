import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
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
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) return forbiddenResponse(401);
  if (!entitlements.isAdmin) return forbiddenResponse(403);

  const settings = await getWaitlistSettings();
  return NextResponse.json(
    { success: true, settings },
    { headers: NO_STORE_HEADERS }
  );
}

export async function PATCH(request: Request) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) return forbiddenResponse(401);
  if (!entitlements.isAdmin) return forbiddenResponse(403);

  const parsedBody = await parseJsonBody<unknown>(request, {
    route: 'PATCH /app/admin/waitlist/settings',
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
    { success: true, settings },
    { headers: NO_STORE_HEADERS }
  );
}
