import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    {
      error: 'Deprecated route. Use /api/canvas/generations/:id instead.',
    },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated route. Use POST /api/canvas/generations instead.',
    },
    { status: 410 }
  );
}
