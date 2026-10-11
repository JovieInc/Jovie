import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';
import {
  registerIosPushDevice,
  unregisterIosPushDevice,
} from '@/lib/notifications/ios-push-devices';
import { isIanaTimeZone } from '@/lib/notifications/recipient-preferences';

const deviceTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32,256}$/, 'Invalid APNs device token');

const registrationSchema = z.object({
  token: deviceTokenSchema,
  environment: z.enum(['sandbox', 'production']),
  timezone: z.string().trim().refine(isIanaTimeZone, 'Invalid IANA timezone'),
});

const unregisterSchema = z.object({ token: deviceTokenSchema });

async function authenticatedUserId(request: Request): Promise<string | null> {
  return getMobileSessionUserId(request);
}

export async function PUT(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = registrationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid push device registration' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  await registerIosPushDevice({ userId, ...parsed.data });
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}

export async function DELETE(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = unregisterSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid push device registration' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  await unregisterIosPushDevice({ userId, token: parsed.data.token });
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}
