import { NextResponse } from 'next/server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Cloudinary signing endpoint - DISABLED
 *
 * This endpoint was used for Cloudinary direct uploads but has been
 * disabled in favor of Vercel Blob storage. Keeping the route to
 * prevent 404s from any cached client code.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Cloudinary not enabled' },
    { status: 404, headers: NO_STORE_HEADERS }
  );
}
