import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { readShippingStateSource } from '@/lib/ovie/shipping-state';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: NextRequest) {
  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized', read: { kind: 'unauthorized' } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const read = await readShippingStateSource();
    return NextResponse.json(
      { schema: 'ovie.shipping-state.v1', read },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('HUD shipping-state read failed', error, {
      route: '/api/hud/shipping-state',
    });
    return NextResponse.json(
      {
        schema: 'ovie.shipping-state.v1',
        read: { kind: 'unavailable', reason: 'route-error' },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }
}
