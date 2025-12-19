import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function signParams(
  params: Record<string, string | number | undefined>
): string {
  // Cloudinary signature: sort keys alphabetically, join as key=value&..., append API secret, sha1
  const filtered: Record<string, string | number> = {};
  Object.keys(params)
    .sort()
    .forEach(k => {
      const v = params[k];
      if (typeof v !== 'undefined' && v !== '' && v !== null)
        filtered[k] = v as string | number;
    });

  const toSign = Object.entries(filtered)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const signature = crypto
    .createHash('sha256')
    .update(`${toSign}${env.CLOUDINARY_API_SECRET ?? ''}`)
    .digest('hex');

  return signature;
}

export async function POST(req: NextRequest) {
  // Feature flag removed - Cloudinary disabled by default
  return NextResponse.json(
    { error: 'Cloudinary not enabled' },
    { status: 404, headers: NO_STORE_HEADERS }
  );

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  if (
    !publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    return NextResponse.json(
      { error: 'Cloudinary not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const now = Math.floor(Date.now() / 1000);

  // Optional JSON body to customize folder/preset; safe defaults
  let body: { folder?: string; upload_preset?: string } = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch {
    // ignore body parse errors
  }

  const folder =
    body.folder ?? env.CLOUDINARY_UPLOAD_FOLDER ?? `users/${userId}`;
  const upload_preset =
    body.upload_preset ?? env.CLOUDINARY_UPLOAD_PRESET ?? undefined;

  const params = {
    folder,
    timestamp: now,
    upload_preset,
  } as const;

  const signature = signParams(
    params as Record<string, string | number | undefined>
  );

  return NextResponse.json(
    {
      cloudName: publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      timestamp: now,
      folder,
      upload_preset,
      signature,
    },
    { headers: NO_STORE_HEADERS }
  );
}
