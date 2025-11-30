import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function handler() {
  return NextResponse.json(
    { error: 'Ingest endpoint is no longer available' },
    { status: 404 }
  );
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const OPTIONS = handler;
