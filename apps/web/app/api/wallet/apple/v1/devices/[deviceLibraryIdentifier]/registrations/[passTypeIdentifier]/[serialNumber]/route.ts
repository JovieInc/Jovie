import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  getAppleWalletPassBySerial,
  registerAppleWalletDevice,
  unregisterAppleWalletDevice,
  verifyAppleWalletAuthenticationToken,
} from '@/lib/wallet/apple/profile-pass';

export const runtime = 'nodejs';

const registerSchema = z.object({
  pushToken: z.string().trim().min(1).max(512),
});

function getApplePassToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('ApplePass ')) return null;
  const token = header.slice('ApplePass '.length).trim();
  return token || null;
}

async function resolveAuthorizedPass(
  request: NextRequest,
  passTypeIdentifier: string,
  serialNumber: string
) {
  const pass = await getAppleWalletPassBySerial(
    db,
    passTypeIdentifier,
    serialNumber
  );
  if (!pass) return { response: new NextResponse(null, { status: 404 }) };

  const token = getApplePassToken(request);
  if (!token || !verifyAppleWalletAuthenticationToken(pass, token)) {
    return { response: new NextResponse(null, { status: 401 }) };
  }

  return { pass };
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly deviceLibraryIdentifier: string;
      readonly passTypeIdentifier: string;
      readonly serialNumber: string;
    }>;
  }
) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } =
    await params;
  try {
    const authorized = await resolveAuthorizedPass(
      request,
      passTypeIdentifier,
      serialNumber
    );
    if ('response' in authorized) return authorized.response;

    const parsed = registerSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid registration payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await registerAppleWalletDevice(db, {
      passId: authorized.pass.id,
      deviceLibraryIdentifier,
      pushToken: parsed.data.pushToken,
    });

    return new NextResponse(null, { status: result === 'created' ? 201 : 200 });
  } catch (error) {
    await captureError('Apple Wallet pass registration failed', error, {
      route:
        '/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]',
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
    });
    return NextResponse.json(
      { error: 'Unable to register pass' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly deviceLibraryIdentifier: string;
      readonly passTypeIdentifier: string;
      readonly serialNumber: string;
    }>;
  }
) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } =
    await params;
  try {
    const authorized = await resolveAuthorizedPass(
      request,
      passTypeIdentifier,
      serialNumber
    );
    if ('response' in authorized) return authorized.response;

    await unregisterAppleWalletDevice(db, {
      passId: authorized.pass.id,
      deviceLibraryIdentifier,
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    await captureError('Apple Wallet pass unregister failed', error, {
      route:
        '/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]',
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
    });
    return NextResponse.json(
      { error: 'Unable to unregister pass' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
