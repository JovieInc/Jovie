import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { buildMobileCalendar } from '@/lib/mobile/action-loop-calendar';
import { resolveMobileReadyProfile } from '@/lib/mobile/ready-profile-route';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const resolved = await resolveMobileReadyProfile(request);
    if (!resolved.ok) {
      return resolved.response;
    }

    const payload = await buildMobileCalendar(resolved.context.profile.id);

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Mobile calendar route failed', error, {
      route: '/api/mobile/v1/calendar',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}