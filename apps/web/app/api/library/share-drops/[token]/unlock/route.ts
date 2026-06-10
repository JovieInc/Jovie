import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { LIBRARY_SHARE_DROP_COOKIE } from '@/lib/library-share/constants';
import { verifyLibraryShareDropPassphrase } from '@/lib/library-share/service';

export const runtime = 'nodejs';

const unlockSchema = z.object({
  passphrase: z.string().min(1).max(128),
});

interface RouteParams {
  readonly params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const parsed = unlockSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid passphrase' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const isValid = await verifyLibraryShareDropPassphrase(
    token,
    parsed.data.passphrase
  );

  if (!isValid) {
    return NextResponse.json(
      { error: 'Incorrect passphrase' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: NO_STORE_HEADERS }
  );
  response.cookies.set(LIBRARY_SHARE_DROP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
