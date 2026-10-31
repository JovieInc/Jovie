import { connection, NextResponse } from 'next/server';

/** Liveness probe: always answered by the running server, never a prerender. */
export async function GET() {
  await connection();
  return NextResponse.json({ status: 'ok', app: 'console' });
}
