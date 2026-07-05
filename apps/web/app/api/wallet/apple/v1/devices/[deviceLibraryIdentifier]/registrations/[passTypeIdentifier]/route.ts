import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getChangedAppleWalletSerialNumbers } from '@/lib/wallet/apple/profile-pass';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly deviceLibraryIdentifier: string;
      readonly passTypeIdentifier: string;
    }>;
  }
) {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await params;
  try {
    const result = await getChangedAppleWalletSerialNumbers(db, {
      deviceLibraryIdentifier,
      passTypeIdentifier,
      passesUpdatedSince:
        request.nextUrl.searchParams.get('passesUpdatedSince') ?? null,
    });

    if (!result) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(
      {
        serialNumbers: result.serialNumbers,
        lastUpdated: result.lastUpdated,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Apple Wallet changed serial lookup failed', error, {
      route:
        '/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]',
      deviceLibraryIdentifier,
      passTypeIdentifier,
    });
    return NextResponse.json(
      { error: 'Unable to fetch changed passes' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
