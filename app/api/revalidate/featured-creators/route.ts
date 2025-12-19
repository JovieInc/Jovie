import { revalidateTag, updateTag } from 'next/cache';
import { NextResponse } from 'next/server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;

  if (process.env.NODE_ENV === 'production' && !secret) {
    return NextResponse.json(
      { error: 'Revalidation secret not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  updateTag('featured-creators');
  revalidateTag('featured-creators', 'max');
  return NextResponse.json(
    { revalidated: true },
    { headers: NO_STORE_HEADERS }
  );
}
