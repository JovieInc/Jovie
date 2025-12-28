import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

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
