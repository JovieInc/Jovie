import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  buildAppleWalletPassFileName,
  buildAppleWalletPassResponseHeaders,
  generateAppleWalletProfilePassBuffer,
  getAppleWalletPassBySerial,
  toAppleWalletPassResponseBody,
  verifyAppleWalletAuthenticationToken,
} from '@/lib/wallet/apple/profile-pass';

export const runtime = 'nodejs';

function getApplePassToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('ApplePass ')) return null;
  const token = header.slice('ApplePass '.length).trim();
  return token || null;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly passTypeIdentifier: string;
      readonly serialNumber: string;
    }>;
  }
) {
  const { passTypeIdentifier, serialNumber } = await params;
  try {
    const pass = await getAppleWalletPassBySerial(
      db,
      passTypeIdentifier,
      serialNumber
    );
    if (!pass) {
      return new NextResponse(null, { status: 404 });
    }

    const token = getApplePassToken(request);
    if (!token || !verifyAppleWalletAuthenticationToken(pass, token)) {
      return new NextResponse(null, { status: 401 });
    }

    const buffer = await generateAppleWalletProfilePassBuffer(pass, token);
    return new NextResponse(toAppleWalletPassResponseBody(buffer), {
      status: 200,
      headers: buildAppleWalletPassResponseHeaders(
        buildAppleWalletPassFileName(pass.handle)
      ),
    });
  } catch (error) {
    await captureError('Apple Wallet latest pass fetch failed', error, {
      route: '/api/wallet/apple/v1/passes/[passTypeIdentifier]/[serialNumber]',
      passTypeIdentifier,
      serialNumber,
    });
    return NextResponse.json(
      { error: 'Unable to fetch pass' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
